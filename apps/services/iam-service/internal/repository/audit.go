package repository

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/gorm"
)

type auditRepository struct {
	db *gorm.DB
}

func NewAuditRepository(db *gorm.DB) domain.AuditRepository {
	return &auditRepository{db: db}
}

func (r *auditRepository) Create(ctx context.Context, log *domain.AuditLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}

func (r *auditRepository) FindAll(ctx context.Context, skip, limit int) ([]domain.AuditLog, error) {
	var logs []domain.AuditLog
	err := r.db.WithContext(ctx).Order("created_at desc").Offset(skip).Limit(limit).Find(&logs).Error
	if err != nil {
		return nil, err
	}
	return logs, nil
}
