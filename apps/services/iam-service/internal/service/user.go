package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/errors"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/infrastructure/http"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/utils"
	"github.com/go-playground/validator/v10"
	"gorm.io/gorm"
)

type UserService interface {
	CreateUser(ctx context.Context, req dto.CreateUserRequest) (*domain.User, error)
	GetUser(ctx context.Context, id string) (*domain.User, error)
	ListUsers(ctx context.Context, skip, limit int) ([]domain.User, error)
	UpdateUser(ctx context.Context, id string, req dto.UpdateUserRequest) (*domain.User, error)
	DeleteUser(ctx context.Context, id string) error
	AssignRole(ctx context.Context, userID, roleID string) error
}

type userService struct {
	userRepo    domain.UserRepository
	roleRepo    domain.RoleRepository
	auditRepo   domain.AuditRepository
	passwdRepo  domain.PasswordResetRepository
	emailClient http.EmailClient
	validate    *validator.Validate
}

func NewUserService(
	userRepo domain.UserRepository,
	roleRepo domain.RoleRepository,
	auditRepo domain.AuditRepository,
	passwdRepo domain.PasswordResetRepository,
	emailClient http.EmailClient,
) UserService {
	return &userService{
		userRepo:    userRepo,
		roleRepo:    roleRepo,
		auditRepo:   auditRepo,
		passwdRepo:  passwdRepo,
		emailClient: emailClient,
		validate:    validator.New(),
	}
}

func (s *userService) CreateUser(ctx context.Context, req dto.CreateUserRequest) (*domain.User, error) {
	if err := s.validate.Struct(req); err != nil {
		return nil, errors.New(400, "Validation failed", err)
	}

	// Check email uniqueness
	if _, err := s.userRepo.FindByEmail(ctx, req.Email); err == nil {
		return nil, errors.New(409, "Email already exists", nil)
	}

	// Specialization Validation
	if req.UserType == string(domain.UserTypeStudent) {
		if req.EnrollmentDate == nil || req.StudentID == nil {
			return nil, errors.New(400, "Student details (enrollment_date, student_id) are required", nil)
		}
	} else if req.UserType == string(domain.UserTypeEmployee) {
		if req.EmployeeID == nil || req.Designation == nil || req.EmployeeType == nil {
			return nil, errors.New(400, "Employee details (employee_id, designation, employee_type) are required", nil)
		}
	}

	// Pre-check uniqueness for StudentID / EmployeeID using repository lookups
	// This uses direct repository methods to check for existing specialized IDs and returns
	// appropriate errors (409) or propagates DB access errors (500).
	if req.StudentID != nil {
		if _, err := s.userRepo.FindByStudentID(ctx, *req.StudentID); err == nil {
			return nil, errors.New(409, "Student ID already exists", nil)
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return nil, errors.New(500, "Failed to check student ID uniqueness", err)
		}
	}
	if req.EmployeeID != nil {
		if _, err := s.userRepo.FindByEmployeeID(ctx, *req.EmployeeID); err == nil {
			return nil, errors.New(409, "Employee ID already exists", nil)
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return nil, errors.New(500, "Failed to check employee ID uniqueness", err)
		}
	}

	// Generate Temp Password
	tempPassword := utils.GenerateRandomString(12)
	passwordHash, err := utils.HashPassword(tempPassword)
	if err != nil {
		return nil, errors.New(500, "Failed to hash password", err)
	}

	// Create User
	user := &domain.User{
		Email:                   req.Email,
		FullName:                req.FullName,
		PasswordHash:            passwordHash,
		UserType:                domain.UserType(req.UserType),
		IsActive:                true, // Active immediately
		IsPasswordResetRequired: true, // Must reset on first login
		StudentID:               req.StudentID,
		EmployeeID:              req.EmployeeID,
		Designation:             req.Designation,
		EmployeeType:            req.EmployeeType,
	}

	// Parse EnrollmentDate if present
	if req.EnrollmentDate != nil {
		date, err := utils.ParseDate(*req.EnrollmentDate) // Need utils
		if err != nil {
			return nil, errors.New(400, "Invalid enrollment_date format", err)
		}
		user.EnrollmentDate = &date
	}

	// Transactional creation ideally, but for now linear.
	// Attempt to create and map DB unique-constraint errors to 409 responses.
	if err := s.userRepo.Create(ctx, user); err != nil {
		// Try to detect common Postgres unique constraint violation text and return 409 with meaningful message.
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "duplicate key value") || strings.Contains(lower, "unique constraint") || strings.Contains(lower, "sqlstate 23505") {
			// Map to specific field if possible
			if strings.Contains(lower, "idx_users_employee_id") || strings.Contains(lower, "employee_id") {
				return nil, errors.New(409, "Employee ID already exists", err)
			}
			if strings.Contains(lower, "idx_users_student_id") || strings.Contains(lower, "student_id") {
				return nil, errors.New(409, "Student ID already exists", err)
			}
			if strings.Contains(lower, "users_email_key") || strings.Contains(lower, "email") {
				return nil, errors.New(409, "Email already exists", err)
			}
			// Generic unique constraint hit
			return nil, errors.New(409, "Unique constraint violation", err)
		}
		return nil, errors.New(500, "Failed to create user", err)
	}

	// Send Welcome Email with Temp Password (Async)
	go func() {
		// Create a background context or use a detached one if needed.
		// For simplicity, using context.Background() or similar for independent timeout.
		emailCtx := context.Background()
		if err := s.emailClient.SendWelcomeEmail(emailCtx, user.Email, user.FullName, tempPassword); err != nil {
			fmt.Printf("[ERROR] Failed to send welcome email to %s: %v\n", user.Email, err)
		}
	}()

	// TEMP: Log password for testing
	fmt.Printf("[DEBUG] Temp Password for %s: %s\n", user.Email, tempPassword)

	// Log Audit
	s.auditRepo.Create(ctx, &domain.AuditLog{
		Action:     "USER_CREATE",
		EntityName: "users",
		EntityID:   user.ID,
	})

	return user, nil
}

func (s *userService) GetUser(ctx context.Context, id string) (*domain.User, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New(404, "User not found", err)
	}
	return user, nil
}

func (s *userService) ListUsers(ctx context.Context, skip, limit int) ([]domain.User, error) {
	return s.userRepo.FindAll(ctx, skip, limit)
}

func (s *userService) UpdateUser(ctx context.Context, id string, req dto.UpdateUserRequest) (*domain.User, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New(404, "User not found", err)
	}

	if req.FullName != nil {
		user.FullName = *req.FullName
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, errors.New(500, "Failed to update user", err)
	}

	s.auditRepo.Create(ctx, &domain.AuditLog{
		Action:     "USER_UPDATE",
		EntityName: "users",
		EntityID:   user.ID,
	})

	return user, nil
}

func (s *userService) DeleteUser(ctx context.Context, id string) error {
	if err := s.userRepo.Delete(ctx, id); err != nil {
		return errors.New(500, "Failed to delete user", err)
	}

	s.auditRepo.Create(ctx, &domain.AuditLog{
		Action:     "USER_DELETE",
		EntityName: "users",
		EntityID:   id,
	})
	return nil
}

func (s *userService) AssignRole(ctx context.Context, userID, roleID string) error {
	if err := s.roleRepo.AssignRole(ctx, userID, roleID); err != nil {
		return errors.New(500, "Failed to assign role", err)
	}

	s.auditRepo.Create(ctx, &domain.AuditLog{
		Action:     "ROLE_ASSIGN",
		EntityName: "users",
		EntityID:   userID,
	})
	return nil
}
