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
	Login(ctx context.Context, username, password string) (*dto.LoginResponse, error)
	RefreshToken(ctx context.Context, refreshToken string) (*dto.RefreshTokenResponse, error)
	Logout(ctx context.Context, refreshToken string) error
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

func (s *authService) Login(ctx context.Context, username, password string) (*dto.LoginResponse, error) {
	// Get user with role and permissions
	user, err := s.authRepo.GetUserByUsername(ctx, username)
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
		user.Username,
		user.RoleName,
		user.Permissions,
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
	token, err := s.authRepo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, fmt.Errorf("fetching refresh token: %w", err)
	}

	if token == nil {
		return nil, ErrRefreshTokenNotFound
	}

	// Check if expired
	if token.ExpiresAt.Before(time.Now()) {
		return nil, ErrRefreshTokenExpired
	}

	// Check if revoked
	if token.RevokedAt != nil {
		return nil, ErrRefreshTokenRevoked
	}

	// Get user to check status and get updated permissions
	user, err := s.authRepo.GetUserByUsername(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}

	// For refresh, we need to fetch by user ID
	user, err = s.getUserByID(ctx, token.UserID)
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
		user.Username,
		user.RoleName,
		user.Permissions,
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
		ExpiresIn:    int64(expiresAt.Sub(time.Now()) / time.Second),
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
			users.username,
			users.email,
			users.password_hash,
			users.role_id,
			roles.name as role_name,
			users.is_active,
			users.is_password_reset_required
		`).
		Joins("LEFT JOIN roles ON roles.id = users.role_id AND roles.deleted_at IS NULL").
		Where("users.id = ? AND users.deleted_at IS NULL", userID).
		First(&user)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	// Fetch permissions
	var permissions []string
	permQuery := s.db.WithContext(ctx).
		Table("permissions").
		Joins("INNER JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Joins("INNER JOIN roles ON roles.id = role_permissions.role_id").
		Where("roles.id = ? AND permissions.deleted_at IS NULL", user.RoleID).
		Pluck("permissions.name", &permissions)

	if permQuery.Error != nil {
		return nil, permQuery.Error
	}

	user.Permissions = permissions

	return &user, nil
}
