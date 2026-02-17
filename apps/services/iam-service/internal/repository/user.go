package repository

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/gorm"
)

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) domain.UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *userRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Preload("Roles").Preload("Roles.Permissions").First(&user, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Preload("Roles").Preload("Roles.Permissions").First(&user, "email = ?", email).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmailForAuth is optimized for authentication - no preloads for better performance
func (r *userRepository) FindByEmailForAuth(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).First(&user, "email = ?", email).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) FindAll(ctx context.Context, skip, limit int) ([]domain.User, error) {
	var users []domain.User
	err := r.db.WithContext(ctx).Offset(skip).Limit(limit).Find(&users).Error
	if err != nil {
		return nil, err
	}
	return users, nil
}

func (r *userRepository) Update(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

func (r *userRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&domain.User{}, "id = ?", id).Error
}

// FindByStudentID returns a user by their student ID (preloads roles and permissions)
func (r *userRepository) FindByStudentID(ctx context.Context, studentID string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Preload("Roles").Preload("Roles.Permissions").First(&user, "student_id = ?", studentID).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmployeeID returns a user by their employee ID (preloads roles and permissions)
func (r *userRepository) FindByEmployeeID(ctx context.Context, employeeID string) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Preload("Roles").Preload("Roles.Permissions").First(&user, "employee_id = ?", employeeID).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}
