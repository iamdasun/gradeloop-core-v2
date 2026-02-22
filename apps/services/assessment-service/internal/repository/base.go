package repository

import (
	"context"

	"gorm.io/gorm"
)

// Repository is the minimal contract every repository must satisfy.
type Repository interface {
	Close() error
}

// BaseRepository wraps a *gorm.DB and provides shared helpers.
type BaseRepository struct {
	DB *gorm.DB
}

// NewBaseRepository creates a new BaseRepository.
func NewBaseRepository(db *gorm.DB) *BaseRepository {
	return &BaseRepository{DB: db}
}

// Close closes the underlying database connection pool.
func (r *BaseRepository) Close() error {
	sqlDB, err := r.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// WithTx runs fn inside a database transaction.  If fn returns an error the
// transaction is rolled back; otherwise it is committed.
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

// WithTxContext is the context-aware variant of WithTx.
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
