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
	SoftDeleteUser(ctx context.Context, userID uuid.UUID) error
	RestoreUser(ctx context.Context, userID uuid.UUID) error
	GetUsers(ctx context.Context, offset, limit int, userType string, roleID string) ([]*domain.User, error)
	CountUsers(ctx context.Context, userType string, roleID string) (int64, error)
	RoleExists(ctx context.Context, roleID uuid.UUID) (bool, error)
	CreateStudentProfile(ctx context.Context, profile *domain.UserProfileStudent) error
	CreateEmployeeProfile(ctx context.Context, profile *domain.UserProfileEmployee) error
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

func (r *userRepository) CreateStudentProfile(ctx context.Context, profile *domain.UserProfileStudent) error {
	return r.db.WithContext(ctx).Create(profile).Error
}

func (r *userRepository) CreateEmployeeProfile(ctx context.Context, profile *domain.UserProfileEmployee) error {
	return r.db.WithContext(ctx).Create(profile).Error
}

func (r *userRepository) GetUserByID(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	var user domain.User

	query := r.db.WithContext(ctx).
		Preload("Role")

	// Dynamic profile preloading would be nice, but for now let's just use it in GetUsers
	// or we can add it here if needed.

	if err := query.First(&user, userID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
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

func (r *userRepository) SoftDeleteUser(ctx context.Context, userID uuid.UUID) error {
	tx := r.db.WithContext(ctx).Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Soft delete the user
	if err := tx.Model(&domain.User{}).
		Where("id = ?", userID).
		Update("deleted_at", gorm.Expr("NOW()")).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Revoke all refresh tokens for the deleted user
	if err := tx.Model(&domain.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", gorm.Expr("NOW()")).Error; err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit().Error
}

func (r *userRepository) RestoreUser(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Model(&domain.User{}).
		Unscoped().
		Where("id = ?", userID).
		Update("deleted_at", nil).Error
}

func (r *userRepository) GetUsers(ctx context.Context, offset, limit int, userType string, roleID string) ([]*domain.User, error) {
	var users []*domain.User

	db := r.db.WithContext(ctx).Preload("Role")

	if userType == "student" {
		db = db.Joins("INNER JOIN user_profile_students ON user_profile_students.user_id = users.id")
	} else if userType == "employee" {
		db = db.Joins("INNER JOIN user_profile_employees ON user_profile_employees.user_id = users.id")
	}

	if roleID != "" {
		db = db.Where("users.role_id = ?", roleID)
	}

	query := db.Limit(limit).Offset(offset).Find(&users)

	if query.Error != nil {
		return nil, query.Error
	}

	return users, nil
}

func (r *userRepository) CountUsers(ctx context.Context, userType string, roleID string) (int64, error) {
	var count int64
	db := r.db.WithContext(ctx).Model(&domain.User{})

	if userType == "student" {
		db = db.Joins("INNER JOIN user_profile_students ON user_profile_students.user_id = users.id")
	} else if userType == "employee" {
		db = db.Joins("INNER JOIN user_profile_employees ON user_profile_employees.user_id = users.id")
	}

	if roleID != "" {
		db = db.Where("users.role_id = ?", roleID)
	}

	if err := db.Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
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
