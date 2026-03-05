package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"github.com/gradeloop/iam-service/internal/dto"
	"gorm.io/gorm"
)

type AuthRepository interface {
	GetUserByEmail(ctx context.Context, email string) (*dto.UserWithRole, error)
	CreateRefreshToken(ctx context.Context, refreshToken *domain.RefreshToken) error
	GetRefreshToken(ctx context.Context, tokenHash string) (*domain.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenID uuid.UUID) error
	DeleteExpiredRefreshTokens(ctx context.Context, userID uuid.UUID) error
	InvalidateAllRefreshTokens(ctx context.Context, userID uuid.UUID) error
	CreatePasswordResetToken(ctx context.Context, token *domain.PasswordResetToken) error
	GetPasswordResetToken(ctx context.Context, tokenHash string) (*domain.PasswordResetToken, error)
	UsePasswordResetToken(ctx context.Context, tokenID uuid.UUID) error
	GetActiveSessionsCount(ctx context.Context, userID uuid.UUID) (int64, error)
}

type authRepository struct {
	db *gorm.DB
}

func NewAuthRepository(db *gorm.DB) AuthRepository {
	return &authRepository{db: db}
}

func (r *authRepository) GetUserByEmail(ctx context.Context, email string) (*dto.UserWithRole, error) {
	var user dto.UserWithRole

	query := r.db.WithContext(ctx).
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
		Where("users.email = ? AND users.deleted_at IS NULL", email).
		First(&user)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &user, nil
}

func (r *authRepository) CreateRefreshToken(ctx context.Context, refreshToken *domain.RefreshToken) error {
	return r.db.WithContext(ctx).Create(refreshToken).Error
}

func (r *authRepository) GetRefreshToken(ctx context.Context, tokenHash string) (*domain.RefreshToken, error) {
	var token domain.RefreshToken

	query := r.db.WithContext(ctx).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		First(&token)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	// Check if expired
	if token.ExpiresAt.Before(time.Now()) {
		return nil, nil
	}

	return &token, nil
}

func (r *authRepository) RevokeRefreshToken(ctx context.Context, tokenID uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).
		Model(&domain.RefreshToken{}).
		Where("id = ?", tokenID).
		Update("revoked_at", now).Error
}

func (r *authRepository) DeleteExpiredRefreshTokens(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Where("user_id = ? AND expires_at < NOW()", userID).
		Delete(&domain.RefreshToken{}).Error
}

func (r *authRepository) InvalidateAllRefreshTokens(ctx context.Context, userID uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).
		Model(&domain.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now).Error
}

func (r *authRepository) CreatePasswordResetToken(ctx context.Context, token *domain.PasswordResetToken) error {
	return r.db.WithContext(ctx).Create(token).Error
}

func (r *authRepository) GetPasswordResetToken(ctx context.Context, tokenHash string) (*domain.PasswordResetToken, error) {
	var token domain.PasswordResetToken

	query := r.db.WithContext(ctx).
		Where("token_hash = ? AND used_at IS NULL", tokenHash).
		First(&token)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &token, nil
}

func (r *authRepository) UsePasswordResetToken(ctx context.Context, tokenID uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).
		Model(&domain.PasswordResetToken{}).
		Where("id = ?", tokenID).
		Update("used_at", now).Error
}

func (r *authRepository) GetActiveSessionsCount(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64

	query := r.db.WithContext(ctx).
		Model(&domain.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL AND expires_at > NOW()", userID).
		Count(&count)

	if query.Error != nil {
		return 0, query.Error
	}

	return count, nil
}
