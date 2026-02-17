package service

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
)

type AuditService interface {
	ListLogs(ctx context.Context, skip, limit int) ([]domain.AuditLog, error)
}

type auditService struct {
	auditRepo domain.AuditRepository
}

func NewAuditService(auditRepo domain.AuditRepository) AuditService {
	return &auditService{auditRepo: auditRepo}
}

func (s *auditService) ListLogs(ctx context.Context, skip, limit int) ([]domain.AuditLog, error) {
	return s.auditRepo.FindAll(ctx, skip, limit)
}
