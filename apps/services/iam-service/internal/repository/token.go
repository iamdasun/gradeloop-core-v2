package repository

import (
	"context"
	"time"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/gorm"
)

// Add interface to domain/repository.go? (Skip for brevity, assume direct usage or defining here)
// Ideally usually in domain/repository.go
// Let's implement it here.

// Moved to domain/repository.go

type refreshTokenRepository struct {
	db *gorm.DB
}

func NewRefreshTokenRepository(db *gorm.DB) domain.RefreshTokenRepository {
	return &refreshTokenRepository{db: db}
}

func (r *refreshTokenRepository) Create(ctx context.Context, token *domain.RefreshToken) error {
	return r.db.WithContext(ctx).Create(token).Error
}

func (r *refreshTokenRepository) FindByTokenHash(ctx context.Context, hash string) (*domain.RefreshToken, error) {
	var token domain.RefreshToken
	err := r.db.WithContext(ctx).
		Where("token_hash = ? AND revoked = ? AND expires_at > ?", hash, false, time.Now()).
		First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func (r *refreshTokenRepository) Revoke(ctx context.Context, id string, replacedByHash string) error {
	updates := map[string]interface{}{
		"revoked":    true,
		"revoked_at": time.Now(),
	}
	if replacedByHash != "" {
		updates["replaced_by_token_hash"] = replacedByHash
	}
	return r.db.WithContext(ctx).Model(&domain.RefreshToken{}).Where("id = ?", id).Updates(updates).Error
}

func (r *refreshTokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	return r.db.WithContext(ctx).Model(&domain.RefreshToken{}).
		Where("user_id = ? AND revoked = ?", userID, false).
		Updates(map[string]interface{}{
			"revoked":    true,
			"revoked_at": time.Now(),
		}).Error
}
