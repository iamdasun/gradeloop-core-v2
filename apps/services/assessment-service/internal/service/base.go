package service

import (
	"context"

	"gorm.io/gorm"
)

// Service is the base interface all services implement.
type Service interface {
	Close() error
}

// BaseService provides a thin wrapper around a GORM DB handle that all
// concrete services can embed or reference.
type BaseService struct {
	DB *gorm.DB
}

// NewBaseService constructs a BaseService backed by the given DB handle.
func NewBaseService(db *gorm.DB) *BaseService {
	return &BaseService{DB: db}
}

// Close is a no-op for the base service.  Individual services that own
// resources should override this.
func (s *BaseService) Close() error {
	return nil
}

// WithContext returns a shallow copy of the BaseService whose DB handle is
// scoped to the provided context.
func (s *BaseService) WithContext(ctx context.Context) *BaseService {
	return &BaseService{
		DB: s.DB.WithContext(ctx),
	}
}
