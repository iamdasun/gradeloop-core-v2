package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/jwt"
	"github.com/gradeloop/iam-service/internal/repository"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials    = errors.New("invalid credentials")
	ErrUserInactive          = errors.New("user account is inactive")
	ErrPasswordResetRequired = errors.New("password reset required")
	ErrUserNotFound          = errors.New("user not found")
	ErrRefreshTokenNotFound  = errors.New("refresh token not found")
	ErrRefreshTokenExpired   = errors.New("refresh token expired")
	ErrRefreshTokenRevoked   = errors.New("refresh token revoked")
	ErrUnauthorized          = errors.New("unauthorized")
)

type AuthService interface {
	Login(ctx context.Context, email, password string) (*dto.LoginResponse, error)
	RefreshToken(ctx context.Context, refreshToken string) (*dto.RefreshTokenResponse, error)
	Logout(ctx context.Context, refreshToken string) error
	RevokeUserSessions(ctx context.Context, userID uuid.UUID, actorUserType string) (*dto.RevokeUserSessionsResponse, error)
}

type authService struct {
	db                 *gorm.DB
	authRepo           repository.AuthRepository
	jwt                *jwt.JWT
	secretKey          []byte
	refreshTokenExpiry time.Duration
}

func NewAuthService(
	db *gorm.DB,
	authRepo repository.AuthRepository,
	jwtConfig *jwt.JWT,
	secretKey string,
	refreshTokenExpiryDays int64,
) AuthService {
	return &authService{
		db:                 db,
		authRepo:           authRepo,
		jwt:                jwtConfig,
		secretKey:          []byte(secretKey),
		refreshTokenExpiry: time.Duration(refreshTokenExpiryDays) * 24 * time.Hour,
	}
}

func (s *authService) Login(ctx context.Context, email, password string) (*dto.LoginResponse, error) {
	// Get user with role and permissions
	user, err := s.authRepo.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}

	// User not found
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	// Reject inactive users
	if !user.IsActive {
		return nil, ErrUserInactive
	}

	// Reject users requiring password reset
	if user.IsPasswordResetRequired {
		return nil, ErrPasswordResetRequired
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Generate token pair
	accessToken, _, err := jwt.GenerateAccessToken(
		user.ID,
		user.Email,
		user.FullName,
		user.UserType,
		s.secretKey,
		15*time.Minute,
	)
	if err != nil {
		return nil, fmt.Errorf("generating access token: %w", err)
	}

	refreshToken, err := jwt.GenerateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("generating refresh token: %w", err)
	}

	// Hash refresh token
	tokenHash := jwt.HashToken(refreshToken)

	// Delete expired refresh tokens for this user
	if err := s.authRepo.DeleteExpiredRefreshTokens(ctx, user.ID); err != nil {
		// Log error but don't fail the login
		fmt.Printf("warning: failed to delete expired refresh tokens: %v\n", err)
	}

	// Store refresh token in database
	refreshTokenEntity := &domain.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(s.refreshTokenExpiry),
	}

	if err := s.authRepo.CreateRefreshToken(ctx, refreshTokenEntity); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}

	return &dto.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(15 * time.Minute / time.Second),
	}, nil
}

func (s *authService) RefreshToken(ctx context.Context, refreshToken string) (*dto.RefreshTokenResponse, error) {
	// Hash the provided token
	tokenHash := jwt.HashToken(refreshToken)

	// Get refresh token from database
	// Note: GetRefreshToken already checks revoked_at IS NULL and expiry
	token, err := s.authRepo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, fmt.Errorf("fetching refresh token: %w", err)
	}

	if token == nil {
		return nil, ErrRefreshTokenNotFound
	}

	// For refresh, we need to fetch by user ID
	user, err := s.getUserByID(ctx, token.UserID)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}

	if user == nil || !user.IsActive {
		// Revoke the token if user is inactive
		_ = s.authRepo.RevokeRefreshToken(ctx, token.ID)
		return nil, ErrUserInactive
	}

	// Revoke old refresh token
	if err := s.authRepo.RevokeRefreshToken(ctx, token.ID); err != nil {
		// Log but continue
		fmt.Printf("warning: failed to revoke old refresh token: %v\n", err)
	}

	// Generate new access token
	accessToken, expiresAt, err := jwt.GenerateAccessToken(
		user.ID,
		user.Email,
		user.FullName,
		user.UserType,
		s.secretKey,
		15*time.Minute,
	)
	if err != nil {
		return nil, fmt.Errorf("generating access token: %w", err)
	}

	// Generate new refresh token
	newRefreshToken, err := jwt.GenerateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("generating refresh token: %w", err)
	}

	// Hash and store new refresh token
	newTokenHash := jwt.HashToken(newRefreshToken)
	newRefreshTokenEntity := &domain.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: newTokenHash,
		ExpiresAt: time.Now().Add(s.refreshTokenExpiry),
	}

	if err := s.authRepo.CreateRefreshToken(ctx, newRefreshTokenEntity); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}

	return &dto.RefreshTokenResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    int64(time.Until(expiresAt) / time.Second),
	}, nil
}

func (s *authService) Logout(ctx context.Context, refreshToken string) error {
	tokenHash := jwt.HashToken(refreshToken)

	token, err := s.authRepo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return fmt.Errorf("fetching refresh token: %w", err)
	}

	if token == nil {
		// Token not found, already logged out or invalid
		return nil
	}

	return s.authRepo.RevokeRefreshToken(ctx, token.ID)
}

func (s *authService) getUserByID(ctx context.Context, userID uuid.UUID) (*dto.UserWithRole, error) {
	var user dto.UserWithRole

	query := s.db.WithContext(ctx).
		Table("users").
		Select(`
			users.id,
			users.email,
			users.full_name,
			users.password_hash,
			users.user_type,
			users.is_active,
			users.is_password_reset_required
		`).
		Where("users.id = ? AND users.deleted_at IS NULL", userID).
		First(&user)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &user, nil
}

func (s *authService) RevokeUserSessions(ctx context.Context, userID uuid.UUID, actorUserType string) (*dto.RevokeUserSessionsResponse, error) {
	// Check if actor has permission to manage user sessions (only admin and super_admin)
	if actorUserType != "admin" && actorUserType != "super_admin" {
		return nil, ErrUnauthorized
	}

	// Get active sessions count before revocation
	activeCount, err := s.authRepo.GetActiveSessionsCount(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("checking active sessions: %w", err)
	}

	// Revoke all refresh tokens for the user
	if err := s.authRepo.InvalidateAllRefreshTokens(ctx, userID); err != nil {
		return nil, fmt.Errorf("revoking sessions: %w", err)
	}

	message := "All user sessions have been revoked"
	if activeCount > 0 {
		message = fmt.Sprintf("Revoked %d active session(s)", activeCount)
	}

	return &dto.RevokeUserSessionsResponse{
		Message: message,
	}, nil
}
