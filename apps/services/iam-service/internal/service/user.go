package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/client"
	"github.com/gradeloop/iam-service/internal/domain"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/jwt"
	"github.com/gradeloop/iam-service/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrEmailTaken   = errors.New("email already exists")
	ErrRoleNotFound = errors.New("role not found")
)

type UserService interface {
	CreateUser(ctx context.Context, req *dto.CreateUserRequest, actorPermissions []string) (*dto.CreateUserResponse, error)
	GetUsers(ctx context.Context, page, limit int, userType string, roleID string, search string) (*dto.GetUsersResponse, error)
	UpdateUser(ctx context.Context, id string, req *dto.UpdateUserRequest) (*dto.UpdateUserResponse, error)
	DeleteUser(ctx context.Context, id string) error
	RestoreUser(ctx context.Context, id string) error
	GetProfile(ctx context.Context, userID string) (*dto.UserResponse, error)
	GetUserByID(ctx context.Context, userID string) (*dto.UserResponse, error)
	UpdateAvatar(ctx context.Context, userID string, avatarURL string) (*dto.UpdateAvatarResponse, error)
}

type userService struct {
	db                    *gorm.DB
	userRepo              repository.UserRepository
	authRepo              repository.AuthRepository
	secretKey             []byte
	activationTokenExpiry time.Duration
	emailClient           *client.EmailClient
	frontendURL           string
}

func NewUserService(
	db *gorm.DB,
	userRepo repository.UserRepository,
	authRepo repository.AuthRepository,
	secretKey string,
	activationTokenExpiryHours int64,
	emailClient *client.EmailClient,
	frontendURL string,
) UserService {
	return &userService{
		db:                    db,
		userRepo:              userRepo,
		authRepo:              authRepo,
		secretKey:             []byte(secretKey),
		activationTokenExpiry: time.Duration(activationTokenExpiryHours) * time.Hour,
		emailClient:           emailClient,
		frontendURL:           frontendURL,
	}
}

func (s *userService) CreateUser(ctx context.Context, req *dto.CreateUserRequest, actorPermissions []string) (*dto.CreateUserResponse, error) {
	// Check if actor has permission to create users
	hasPermission := false
	for _, perm := range actorPermissions {
		if perm == "users:write" {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		return nil, ErrUnauthorized
	}

	// Parse role ID
	roleID, err := uuid.Parse(req.RoleID)
	if err != nil {
		return nil, fmt.Errorf("invalid role ID: %w", err)
	}

	// Check if role exists
	roleExists, err := s.userRepo.RoleExists(ctx, roleID)
	if err != nil {
		return nil, fmt.Errorf("checking role: %w", err)
	}
	if !roleExists {
		return nil, ErrRoleNotFound
	}

	// Check if email already exists
	existingUser, err := s.userRepo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("checking email: %w", err)
	}
	if existingUser != nil {
		return nil, ErrEmailTaken
	}

	// User initial password will be set via password reset link flow

	// Use a transaction for user and profile creation
	tx := s.db.WithContext(ctx).Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	user := &domain.User{
		ID:                      uuid.New(),
		Email:                   req.Email,
		FullName:                req.FullName,
		PasswordHash:            "", // First-time user flow, password is empty initially
		RoleID:                  &roleID,
		Department:              req.Department,
		Faculty:                 req.Faculty,
		IsActive:                false,
		IsPasswordResetRequired: true,
	}

	if err := tx.Create(user).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("creating user: %w", err)
	}

	// Create profile based on type
	if req.UserType == "student" {
		if req.StudentID == "" {
			tx.Rollback()
			return nil, errors.New("student_id is required for student type")
		}
		profile := &domain.UserProfileStudent{
			UserID:    user.ID,
			StudentID: req.StudentID,
		}
		if err := tx.Create(profile).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("creating student profile: %w", err)
		}
	} else if req.UserType == "employee" {
		if req.Designation == "" {
			tx.Rollback()
			return nil, errors.New("designation is required for employee type")
		}
		profile := &domain.UserProfileEmployee{
			UserID:      user.ID,
			Designation: req.Designation,
		}
		if err := tx.Create(profile).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("creating employee profile: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}

	// Generate reset token
	resetToken, err := GenerateResetToken()
	if err != nil {
		return nil, fmt.Errorf("generating password reset token: %w", err)
	}

	// Hash the token for DB
	tokenHash := jwt.HashToken(resetToken)

	// Create and save the token
	expiresAt := time.Now().Add(s.activationTokenExpiry)
	resetTokenEntity := &domain.PasswordResetToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt,
	}

	if err := s.authRepo.CreatePasswordResetToken(ctx, resetTokenEntity); err != nil {
		return nil, fmt.Errorf("storing password reset token: %w", err)
	}

	// Create password reset link
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.frontendURL, resetToken)

	// Send setup email
	if s.emailClient != nil {
		if err := s.emailClient.SendPasswordResetEmail(ctx, user.Email, user.FullName, resetLink); err != nil {
			// Log the error but don't fail the user creation
			fmt.Printf("Warning: Failed to send setup email to %s: %v\n", user.Email, err)
		}
	}

	return &dto.CreateUserResponse{
		ID:        user.ID,
		FullName:  user.FullName,
		Email:     user.Email,
		RoleID:    roleID,
		IsActive:  user.IsActive,
		ResetLink: resetLink,
		Message:   fmt.Sprintf("User created successfully. A setup email has been sent to %s. The link expires at %s", user.Email, expiresAt.Format(time.RFC3339)),
	}, nil
}

func (s *userService) GetUsers(ctx context.Context, page, limit int, userType string, roleID string, search string) (*dto.GetUsersResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	offset := (page - 1) * limit

	users, err := s.userRepo.GetUsers(ctx, offset, limit, userType, roleID, search)
	if err != nil {
		return nil, fmt.Errorf("fetching users: %w", err)
	}

	totalCount, err := s.userRepo.CountUsers(ctx, userType, roleID, search)
	if err != nil {
		return nil, fmt.Errorf("counting users: %w", err)
	}

	var userResponses []dto.UserResponse
	for _, user := range users {
		roleName := ""
		if user.Role != nil {
			roleName = user.Role.Name
		}

		var roleID uuid.UUID
		if user.RoleID != nil {
			roleID = *user.RoleID
		}

		resolvedUserType := "all"
		studentID := ""
		designation := ""

		// Check for profiles
		var student domain.UserProfileStudent
		if err := s.db.WithContext(ctx).Where("user_id = ?", user.ID).First(&student).Error; err == nil {
			resolvedUserType = "student"
			studentID = student.StudentID
		} else {
			var employee domain.UserProfileEmployee
			if err := s.db.WithContext(ctx).Where("user_id = ?", user.ID).First(&employee).Error; err == nil {
				resolvedUserType = "employee"
				designation = employee.Designation
			}
		}

		userResponses = append(userResponses, dto.UserResponse{
			ID:          user.ID,
			Email:       user.Email,
			FullName:    user.FullName,
			AvatarURL:   user.AvatarURL,
			RoleID:      roleID,
			RoleName:    roleName,
			UserType:    resolvedUserType,
			Faculty:     user.Faculty,
			Department:  user.Department,
			StudentID:   studentID,
			Designation: designation,
			IsActive:    user.IsActive,
			CreatedAt:   user.CreatedAt.Format(time.RFC3339),
		})
	}

	return &dto.GetUsersResponse{
		Users:      userResponses,
		TotalCount: totalCount,
		Page:       page,
		Limit:      limit,
	}, nil
}

func (s *userService) UpdateUser(ctx context.Context, id string, req *dto.UpdateUserRequest) (*dto.UpdateUserResponse, error) {
	userID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	if req.RoleID != nil {
		roleID, err := uuid.Parse(*req.RoleID)
		if err != nil {
			return nil, fmt.Errorf("invalid role ID: %w", err)
		}

		roleExists, err := s.userRepo.RoleExists(ctx, roleID)
		if err != nil {
			return nil, fmt.Errorf("checking role: %w", err)
		}
		if !roleExists {
			return nil, ErrRoleNotFound
		}
		user.RoleID = &roleID
	}

	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if err := s.userRepo.UpdateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("updating user: %w", err)
	}

	var roleID uuid.UUID
	if user.RoleID != nil {
		roleID = *user.RoleID
	}

	return &dto.UpdateUserResponse{
		ID:       user.ID,
		Email:    user.Email,
		RoleID:   roleID,
		IsActive: user.IsActive,
		Message:  "User updated successfully",
	}, nil
}

func (s *userService) DeleteUser(ctx context.Context, id string) error {
	userID, err := uuid.Parse(id)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	// Check if user exists
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return ErrUserNotFound
	}

	if err := s.userRepo.SoftDeleteUser(ctx, userID); err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}

	return nil
}

func (s *userService) RestoreUser(ctx context.Context, id string) error {
	userID, err := uuid.Parse(id)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	// We can't check if user exists with GetUserByID because it filters out soft deleted users
	// But RestoreUser in repo should handle it or we can add FindWithDeleted to repo.
	// For now, let's rely on RestoreUser repo method which uses Unscoped.

	if err := s.userRepo.RestoreUser(ctx, userID); err != nil {
		return fmt.Errorf("restoring user: %w", err)
	}

	return nil
}

func (s *userService) GetProfile(ctx context.Context, id string) (*dto.UserResponse, error) {
	userID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	roleName := ""
	if user.Role != nil {
		roleName = user.Role.Name
	}

	var roleID uuid.UUID
	if user.RoleID != nil {
		roleID = *user.RoleID
	}

	resolvedUserType := "all"
	studentID := ""
	designation := ""

	// Check for profiles
	var student domain.UserProfileStudent
	if err := s.db.WithContext(ctx).Where("user_id = ?", user.ID).First(&student).Error; err == nil {
		resolvedUserType = "student"
		studentID = student.StudentID
	} else {
		var employee domain.UserProfileEmployee
		if err := s.db.WithContext(ctx).Where("user_id = ?", user.ID).First(&employee).Error; err == nil {
			resolvedUserType = "employee"
			designation = employee.Designation
		}
	}

	return &dto.UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		FullName:    user.FullName,
		AvatarURL:   user.AvatarURL,
		RoleID:      roleID,
		RoleName:    roleName,
		UserType:    resolvedUserType,
		Faculty:     user.Faculty,
		Department:  user.Department,
		StudentID:   studentID,
		Designation: designation,
		IsActive:    user.IsActive,
		CreatedAt:   user.CreatedAt.Format(time.RFC3339),
	}, nil
}

func (s *userService) GetUserByID(ctx context.Context, userID string) (*dto.UserResponse, error) {
	id, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.userRepo.GetUserByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	roleName := ""
	if user.Role != nil {
		roleName = user.Role.Name
	}

	var roleID uuid.UUID
	if user.RoleID != nil {
		roleID = *user.RoleID
	}

	resolvedUserType := "all"
	studentID := ""
	designation := ""

	// Check for profiles
	var student domain.UserProfileStudent
	if err := s.db.WithContext(ctx).Where("user_id = ?", user.ID).First(&student).Error; err == nil {
		resolvedUserType = "student"
		studentID = student.StudentID
	} else {
		var employee domain.UserProfileEmployee
		if err := s.db.WithContext(ctx).Where("user_id = ?", user.ID).First(&employee).Error; err == nil {
			resolvedUserType = "employee"
			designation = employee.Designation
		}
	}

	return &dto.UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		FullName:    user.FullName,
		AvatarURL:   user.AvatarURL,
		RoleID:      roleID,
		RoleName:    roleName,
		UserType:    resolvedUserType,
		Faculty:     user.Faculty,
		Department:  user.Department,
		StudentID:   studentID,
		Designation: designation,
		IsActive:    user.IsActive,
		CreatedAt:   user.CreatedAt.Format(time.RFC3339),
	}, nil
}

func (s *userService) UpdateAvatar(ctx context.Context, id string, avatarURL string) (*dto.UpdateAvatarResponse, error) {
	userID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	user.AvatarURL = avatarURL
	if err := s.userRepo.UpdateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("updating user avatar: %w", err)
	}

	return &dto.UpdateAvatarResponse{
		AvatarURL: user.AvatarURL,
		Message:   "Avatar updated successfully",
	}, nil
}
