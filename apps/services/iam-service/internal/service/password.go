package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/client"
	"github.com/gradeloop/iam-service/internal/domain"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/jwt"
	"github.com/gradeloop/iam-service/internal/repository"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrCurrentPasswordInvalid    = errors.New("current password is incorrect")
	ErrNewPasswordSameAsOld      = errors.New("new password must be different from current password")
	ErrPasswordTooWeak           = errors.New("password does not meet security requirements")
	ErrPasswordResetTokenInvalid = errors.New("invalid password reset token")
	ErrPasswordResetTokenExpired = errors.New("password reset token has expired")
	ErrPasswordResetTokenUsed    = errors.New("password reset token has already been used")
)

// PasswordStrength requirements:
// - Minimum 8 characters
// - At least one uppercase letter
// - At least one lowercase letter
// - At least one digit
// - At least one special character

type PasswordService interface {
	ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword string) (*dto.ChangePasswordResponse, error)
	ForgotPassword(ctx context.Context, email string) (*dto.ForgotPasswordResponse, error)
	ResetPassword(ctx context.Context, token, newPassword string) (*dto.ResetPasswordResponse, error)
}

type passwordService struct {
	db               *gorm.DB
	authRepo         repository.AuthRepository
	userRepo         repository.UserRepository
	secretKey        []byte
	resetTokenExpiry time.Duration
	emailClient      *client.EmailClient
	frontendURL      string
}

func NewPasswordService(
	db *gorm.DB,
	authRepo repository.AuthRepository,
	userRepo repository.UserRepository,
	secretKey string,
	resetTokenExpiryHours int64,
	emailClient *client.EmailClient,
	frontendURL string,
) PasswordService {
	return &passwordService{
		db:               db,
		authRepo:         authRepo,
		userRepo:         userRepo,
		secretKey:        []byte(secretKey),
		resetTokenExpiry: time.Duration(resetTokenExpiryHours) * time.Hour,
		emailClient:      emailClient,
		frontendURL:      frontendURL,
	}
}

func (s *passwordService) ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword string) (*dto.ChangePasswordResponse, error) {
	// Validate new password strength
	if err := validatePasswordStrength(newPassword); err != nil {
		return nil, err
	}

	// Get user
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}

	if user == nil {
		return nil, ErrUserNotFound
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return nil, ErrCurrentPasswordInvalid
	}

	// Check if new password is same as old
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(newPassword)); err == nil {
		return nil, ErrNewPasswordSameAsOld
	}

	// Hash new password
	newPasswordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	// Use transaction to update password and invalidate tokens
	err = repository.WithTxContext(ctx, s.db, func(tx *gorm.DB) error {
		// Update user password
		user.PasswordHash = string(newPasswordHash)
		user.IsPasswordResetRequired = false
		if err := tx.Save(user).Error; err != nil {
			return fmt.Errorf("updating password: %w", err)
		}

		// Invalidate all refresh tokens for this user
		if err := s.authRepo.InvalidateAllRefreshTokens(ctx, userID); err != nil {
			return fmt.Errorf("invalidating refresh tokens: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &dto.ChangePasswordResponse{
		Message: "Password changed successfully. Please login with your new password.",
	}, nil
}

func (s *passwordService) ForgotPassword(ctx context.Context, email string) (*dto.ForgotPasswordResponse, error) {
	// Get user by email
	user, err := s.userRepo.GetUserByEmail(ctx, email)
	if err != nil {
		// Don't reveal if email exists or not for security
		return &dto.ForgotPasswordResponse{
			Message: "If an account exists with this email, a password reset link has been sent.",
		}, nil
	}

	if user == nil {
		// Don't reveal if email exists or not for security
		return &dto.ForgotPasswordResponse{
			Message: "If an account exists with this email, a password reset link has been sent.",
		}, nil
	}

	// Generate reset token
	resetToken, err := generateResetToken()
	if err != nil {
		return nil, fmt.Errorf("generating reset token: %w", err)
	}

	// Hash token for storage
	tokenHash := jwt.HashToken(resetToken)

	// Create password reset token
	resetTokenEntity := &domain.PasswordResetToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(s.resetTokenExpiry),
	}

	if err := s.authRepo.CreatePasswordResetToken(ctx, resetTokenEntity); err != nil {
		return nil, fmt.Errorf("storing reset token: %w", err)
	}

	// Generate reset link
	resetLink := fmt.Sprintf("%s/auth/reset-password?token=%s", s.frontendURL, resetToken)

	// Send password reset email
	if s.emailClient != nil {
		if err := s.emailClient.SendPasswordResetEmail(ctx, email, user.Username, resetLink); err != nil {
			// Log the error but don't fail the request (for security, we don't reveal if email exists)
			// In production, you might want to queue this for retry
			fmt.Printf("Warning: Failed to send password reset email to %s: %v\n", email, err)
		}
	}

	return &dto.ForgotPasswordResponse{
		Message: "If an account exists with this email, a password reset link has been sent.",
	}, nil
}

func (s *passwordService) ResetPassword(ctx context.Context, token, newPassword string) (*dto.ResetPasswordResponse, error) {
	// Validate new password strength
	if err := validatePasswordStrength(newPassword); err != nil {
		return nil, err
	}

	// Hash token to lookup
	tokenHash := jwt.HashToken(token)

	// Get reset token
	resetToken, err := s.authRepo.GetPasswordResetToken(ctx, tokenHash)
	if err != nil {
		return nil, fmt.Errorf("fetching reset token: %w", err)
	}

	if resetToken == nil {
		return nil, ErrPasswordResetTokenInvalid
	}

	// Check if expired
	if resetToken.ExpiresAt.Before(time.Now()) {
		return nil, ErrPasswordResetTokenExpired
	}

	// Get user
	user, err := s.userRepo.GetUserByID(ctx, resetToken.UserID)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}

	if user == nil {
		return nil, ErrUserNotFound
	}

	// Hash new password
	newPasswordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	// Use transaction to update password, mark token as used, and invalidate tokens
	err = repository.WithTxContext(ctx, s.db, func(tx *gorm.DB) error {
		// Update user password
		user.PasswordHash = string(newPasswordHash)
		user.IsPasswordResetRequired = false
		if err := tx.Save(user).Error; err != nil {
			return fmt.Errorf("updating password: %w", err)
		}

		// Mark reset token as used
		if err := s.authRepo.UsePasswordResetToken(ctx, resetToken.ID); err != nil {
			return fmt.Errorf("using reset token: %w", err)
		}

		// Invalidate all refresh tokens for this user
		if err := s.authRepo.InvalidateAllRefreshTokens(ctx, user.ID); err != nil {
			return fmt.Errorf("invalidating refresh tokens: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &dto.ResetPasswordResponse{
		Message: "Password reset successfully. You can now login with your new password.",
	}, nil
}

// validatePasswordStrength checks if password meets security requirements
func validatePasswordStrength(password string) error {
	if len(password) < 8 {
		return ErrPasswordTooWeak
	}

	var (
		hasUpper   bool
		hasLower   bool
		hasNumber  bool
		hasSpecial bool
	)

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !(hasUpper && hasLower && hasNumber && hasSpecial) {
		return ErrPasswordTooWeak
	}

	return nil
}

// generateResetToken generates a cryptographically secure random token
func generateResetToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generating random bytes: %w", err)
	}

	token := base64.URLEncoding.EncodeToString(bytes)
	return token, nil
}
