package service

import (
	"context"

	"gorm.io/gorm"
)

type Service interface {
	Close() error
}

type BaseService struct {
	DB *gorm.DB
}

func NewBaseService(db *gorm.DB) *BaseService {
	return &BaseService{DB: db}
}

func (s *BaseService) Close() error {
	return nil
}

func (s *BaseService) WithContext(ctx context.Context) *BaseService {
	return &BaseService{
		DB: s.DB.WithContext(ctx),
	}
}
