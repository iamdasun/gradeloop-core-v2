package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	repoMocks "github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/repository/mocks"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestUserService_CreateUser(t *testing.T) {
	mockUserRepo := new(repoMocks.UserRepository)
	mockRoleRepo := new(repoMocks.RoleRepository)
	mockAuditRepo := new(repoMocks.AuditRepository)
	mockPasswdRepo := new(repoMocks.PasswordResetRepository)
	mockEmailClient := new(MockEmailClient)
	userService := service.NewUserService(mockUserRepo, mockRoleRepo, mockAuditRepo, mockPasswdRepo, mockEmailClient)

	t.Run("Success", func(t *testing.T) {
		req := dto.CreateUserRequest{
			Email: "test@example.com",
			// Username: "testuser", // Removed from DTO
			FullName:     "Test User",
			UserType:     "EMPLOYEE",
			EmployeeID:   &[]string{"EMP001"}[0],
			Designation:  &[]string{"Engineer"}[0],
			EmployeeType: &[]string{"FullTime"}[0],
		}

		mockUserRepo.On("FindByEmail", mock.Anything, "test@example.com").Return(nil, errors.New("not found")) // User shouldn't exist
		// Service now checks for existing employee id before create, so mock that lookup too
		mockUserRepo.On("FindByEmployeeID", mock.Anything, "EMP001").Return(nil, errors.New("not found"))
		mockUserRepo.On("Create", mock.Anything, mock.MatchedBy(func(u *domain.User) bool {
			return u.Email == "test@example.com" && u.UserType == domain.UserTypeEmployee
		})).Return(nil)

		mockAuditRepo.On("Create", mock.Anything, mock.Anything).Return(nil)

		mockAuditRepo.On("Create", mock.Anything, mock.Anything).Return(nil)

		// mockPasswdRepo.On("Create", mock.Anything, mock.Anything).Return(nil) // No longer called
		// mockEmailClient.On("SendPasswordResetEmail", mock.Anything, "test@example.com", mock.Anything, mock.Anything).Return(nil)
		mockEmailClient.On("SendWelcomeEmail", mock.Anything, "test@example.com", mock.Anything, mock.Anything).Return(nil)

		user, err := userService.CreateUser(context.Background(), req)

		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "test@example.com", user.Email)
		assert.True(t, user.IsActive)
		assert.True(t, user.IsPasswordResetRequired)
		mockUserRepo.AssertExpectations(t)
	})

	t.Run("EmailAlreadyExists", func(t *testing.T) {
		req := dto.CreateUserRequest{
			Email:    "existing@example.com",
			UserType: "EMPLOYEE",
			// other fields
		}

		existingUser := &domain.User{Email: "existing@example.com"}
		mockUserRepo.On("FindByEmail", mock.Anything, "existing@example.com").Return(existingUser, nil)

		user, err := userService.CreateUser(context.Background(), req)

		assert.Error(t, err)
		assert.Nil(t, user)
		// assert.Equal(t, 409, err.(*errors.AppError).Code) // Check error type if needed
	})

	t.Run("EmployeeIDAlreadyExists", func(t *testing.T) {
		req := dto.CreateUserRequest{
			Email:        "another@example.com",
			FullName:     "Another User",
			UserType:     "EMPLOYEE",
			EmployeeID:   &[]string{"EMP001"}[0],
			Designation:  &[]string{"Engineer"}[0],
			EmployeeType: &[]string{"FullTime"}[0],
		}

		// Email does not exist
		mockUserRepo.On("FindByEmail", mock.Anything, "another@example.com").Return(nil, errors.New("not found"))
		// But employee id already exists
		existingUser := &domain.User{ID: "user-emp-1"}
		mockUserRepo.On("FindByEmployeeID", mock.Anything, "EMP001").Return(existingUser, nil)

		user, err := userService.CreateUser(context.Background(), req)

		assert.Error(t, err)
		assert.Nil(t, user)
	})

	t.Run("ValidationError_Student", func(t *testing.T) {
		req := dto.CreateUserRequest{
			Email:    "student@example.com",
			FullName: "Student Name",
			UserType: "STUDENT",
			// Missing EnrollmentDate and StudentID
		}

		mockUserRepo.On("FindByEmail", mock.Anything, "student@example.com").Return(nil, errors.New("not found"))

		user, err := userService.CreateUser(context.Background(), req)

		assert.Error(t, err)
		assert.Nil(t, user)
		assert.Contains(t, err.Error(), "Student details")
	})
}
