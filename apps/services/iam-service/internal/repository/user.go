package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"gorm.io/gorm"
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) error
	GetUserByID(ctx context.Context, userID uuid.UUID) (*domain.User, error)
	GetUserByUsername(ctx context.Context, username string) (*domain.User, error)
	GetUserByEmail(ctx context.Context, email string) (*domain.User, error)
	UpdateUser(ctx context.Context, user *domain.User) error
	RoleExists(ctx context.Context, roleID uuid.UUID) (bool, error)
}

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) CreateUser(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *userRepository) GetUserByID(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	var user domain.User

	query := r.db.WithContext(ctx).
		Preload("Role").
		First(&user, userID)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &user, nil
}

func (r *userRepository) GetUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	var user domain.User

	query := r.db.WithContext(ctx).
		Preload("Role").
		Where("username = ? AND deleted_at IS NULL", username).
		First(&user)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &user, nil
}

func (r *userRepository) GetUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User

	query := r.db.WithContext(ctx).
		Preload("Role").
		Where("email = ? AND deleted_at IS NULL", email).
		First(&user)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &user, nil
}

func (r *userRepository) UpdateUser(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

func (r *userRepository) RoleExists(ctx context.Context, roleID uuid.UUID) (bool, error) {
	var count int64

	query := r.db.WithContext(ctx).
		Model(&domain.Role{}).
		Where("id = ? AND deleted_at IS NULL", roleID).
		Count(&count)

	if query.Error != nil {
		return false, query.Error
	}

	return count > 0, nil
}
