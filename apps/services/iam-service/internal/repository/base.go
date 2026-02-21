package repository

import (
	"context"

	"gorm.io/gorm"
)

type Repository interface {
	Close() error
}

type BaseRepository struct {
	DB *gorm.DB
}

func NewBaseRepository(db *gorm.DB) *BaseRepository {
	return &BaseRepository{DB: db}
}

func (r *BaseRepository) Close() error {
	sqlDB, err := r.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func WithTx(db *gorm.DB, fn func(tx *gorm.DB) error) error {
	tx := db.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback().Error; rbErr != nil {
			return rbErr
		}
		return err
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	return nil
}

func WithTxContext(ctx context.Context, db *gorm.DB, fn func(tx *gorm.DB) error) error {
	tx := db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return tx.Error
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback().Error; rbErr != nil {
			return rbErr
		}
		return err
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	return nil
}
