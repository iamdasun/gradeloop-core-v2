package repository

import (
	"context"
	"time"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/gorm"
)

type passwordResetRepository struct {
	db *gorm.DB
}

func NewPasswordResetRepository(db *gorm.DB) domain.PasswordResetRepository {
	return &passwordResetRepository{db: db}
}

func (r *passwordResetRepository) Create(ctx context.Context, token *domain.PasswordResetToken) error {
	return r.db.WithContext(ctx).Create(token).Error
}

func (r *passwordResetRepository) FindByTokenHash(ctx context.Context, hash string) (*domain.PasswordResetToken, error) {
	var token domain.PasswordResetToken
	err := r.db.WithContext(ctx).First(&token, "token_hash = ?", hash).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func (r *passwordResetRepository) MarkAsUsed(ctx context.Context, id string) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&domain.PasswordResetToken{}).Where("id = ?", id).Update("used_at", now).Error
}

func (r *passwordResetRepository) FindLatestByUserID(ctx context.Context, userID string) (*domain.PasswordResetToken, error) {
	var token domain.PasswordResetToken
	err := r.db.WithContext(ctx).Order("created_at desc").First(&token, "user_id = ?", userID).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func (r *passwordResetRepository) DeleteByUserID(ctx context.Context, userID string) error {
	// Optional: Delete old tokens for clean up or just mark them invalid?
	// Requirement says "Invalidate after use", which MarkAsUsed does.
	// Maybe we want to delete meaningful tokens to prevent clutter?
	// The interface has DeleteByUserID, so let's implement it.
	return r.db.WithContext(ctx).Delete(&domain.PasswordResetToken{}, "user_id = ?", userID).Error
}
