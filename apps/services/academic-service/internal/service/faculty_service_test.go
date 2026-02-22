package service

import (
	"testing"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// MockFacultyRepository is a mock implementation of FacultyRepository
type MockFacultyRepository struct {
	mock.Mock
}

func (m *MockFacultyRepository) CreateFaculty(faculty *domain.Faculty) error {
	args := m.Called(faculty)
	return args.Error(0)
}

func (m *MockFacultyRepository) UpdateFaculty(faculty *domain.Faculty) error {
	args := m.Called(faculty)
	return args.Error(0)
}

func (m *MockFacultyRepository) GetFacultyByID(id uuid.UUID) (*domain.Faculty, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Faculty), args.Error(1)
}

func (m *MockFacultyRepository) GetFacultyByCode(code string) (*domain.Faculty, error) {
	args := m.Called(code)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Faculty), args.Error(1)
}

func (m *MockFacultyRepository) ListFaculties(includeInactive bool) ([]domain.Faculty, error) {
	args := m.Called(includeInactive)
	return args.Get(0).([]domain.Faculty), args.Error(1)
}

func (m *MockFacultyRepository) SoftDeleteFaculty(id uuid.UUID) error {
	args := m.Called(id)
	return args.Error(0)
}

func (m *MockFacultyRepository) FacultyExists(id uuid.UUID) (bool, error) {
	args := m.Called(id)
	return args.Bool(0), args.Error(1)
}

// MockFacultyLeadershipRepository is a mock implementation of FacultyLeadershipRepository
type MockFacultyLeadershipRepository struct {
	mock.Mock
}

func (m *MockFacultyLeadershipRepository) CreateLeaders(leaders []domain.FacultyLeadership) error {
	args := m.Called(leaders)
	return args.Error(0)
}

func (m *MockFacultyLeadershipRepository) DeleteLeadersByFacultyID(facultyID uuid.UUID) error {
	args := m.Called(facultyID)
	return args.Error(0)
}

func (m *MockFacultyLeadershipRepository) GetLeadersByFacultyID(facultyID uuid.UUID) ([]domain.FacultyLeadership, error) {
	args := m.Called(facultyID)
	return args.Get(0).([]domain.FacultyLeadership), args.Error(1)
}

func (m *MockFacultyLeadershipRepository) DeactivateLeadersByFacultyID(facultyID uuid.UUID) error {
	args := m.Called(facultyID)
	return args.Error(0)
}

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)

	err = db.AutoMigrate(&domain.Faculty{}, &domain.FacultyLeadership{})
	require.NoError(t, err)

	return db
}

func TestCreateFaculty_Success(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	req := &dto.CreateFacultyRequest{
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: uuid.New(),
				Role:   "Dean",
			},
		},
	}

	mockFacultyRepo.On("GetFacultyByCode", "FOC").Return(nil, nil)

	faculty, err := service.CreateFaculty(req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.NoError(t, err)
	assert.NotNil(t, faculty)
	assert.Equal(t, "Faculty of Computing", faculty.Name)
	assert.Equal(t, "FOC", faculty.Code)
	assert.True(t, faculty.IsActive)
	mockFacultyRepo.AssertExpectations(t)
}

func TestCreateFaculty_DuplicateCode(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	existingFaculty := &domain.Faculty{
		ID:   uuid.New(),
		Code: "FOC",
		Name: "Existing Faculty",
	}

	req := &dto.CreateFacultyRequest{
		Name: "Faculty of Computing",
		Code: "FOC",
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: uuid.New(),
				Role:   "Dean",
			},
		},
	}

	mockFacultyRepo.On("GetFacultyByCode", "FOC").Return(existingFaculty, nil)

	faculty, err := service.CreateFaculty(req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "faculty with this code already exists")
	mockFacultyRepo.AssertExpectations(t)
}

func TestCreateFaculty_NoLeaders(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	req := &dto.CreateFacultyRequest{
		Name:    "Faculty of Computing",
		Code:    "FOC",
		Leaders: []dto.CreateLeadershipRequest{},
	}

	faculty, err := service.CreateFaculty(req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "faculty must have at least one leader")
}

func TestCreateFaculty_InvalidName(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	req := &dto.CreateFacultyRequest{
		Name: "FO",
		Code: "FOC",
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: uuid.New(),
				Role:   "Dean",
			},
		},
	}

	faculty, err := service.CreateFaculty(req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "name must be between 3 and 255 characters")
}

func TestUpdateFaculty_Success(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	existingFaculty := &domain.Faculty{
		ID:          facultyID,
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Old description",
		IsActive:    true,
	}

	req := &dto.UpdateFacultyRequest{
		Name:        "Faculty of Information Technology",
		Description: "New description",
	}

	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(existingFaculty, nil).Once()
	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(existingFaculty, nil).Once()

	faculty, err := service.UpdateFaculty(facultyID, req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.NoError(t, err)
	assert.NotNil(t, faculty)
	mockFacultyRepo.AssertExpectations(t)
}

func TestUpdateFaculty_NotFound(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	req := &dto.UpdateFacultyRequest{
		Name: "Updated Name",
	}

	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(nil, nil)

	faculty, err := service.UpdateFaculty(facultyID, req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "faculty not found")
	mockFacultyRepo.AssertExpectations(t)
}

func TestUpdateFaculty_WithLeaders(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	existingFaculty := &domain.Faculty{
		ID:       facultyID,
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	req := &dto.UpdateFacultyRequest{
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: uuid.New(),
				Role:   "Dean",
			},
			{
				UserID: uuid.New(),
				Role:   "Deputy Dean",
			},
		},
	}

	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(existingFaculty, nil).Once()
	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(existingFaculty, nil).Once()

	faculty, err := service.UpdateFaculty(facultyID, req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.NoError(t, err)
	assert.NotNil(t, faculty)
	mockFacultyRepo.AssertExpectations(t)
}

func TestUpdateFaculty_NoLeaders(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	existingFaculty := &domain.Faculty{
		ID:       facultyID,
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	req := &dto.UpdateFacultyRequest{
		Leaders: []dto.CreateLeadershipRequest{},
	}

	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(existingFaculty, nil)

	faculty, err := service.UpdateFaculty(facultyID, req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "faculty must have at least one leader")
	mockFacultyRepo.AssertExpectations(t)
}

func TestDeactivateFaculty_Success(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	existingFaculty := &domain.Faculty{
		ID:       facultyID,
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(existingFaculty, nil)
	mockFacultyRepo.On("UpdateFaculty", mock.AnythingOfType("*domain.Faculty")).Return(nil)

	err := service.DeactivateFaculty(facultyID, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.NoError(t, err)
	mockFacultyRepo.AssertExpectations(t)
}

func TestDeactivateFaculty_NotFound(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(nil, nil)

	err := service.DeactivateFaculty(facultyID, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "faculty not found")
	mockFacultyRepo.AssertExpectations(t)
}

func TestGetFacultyByID_Success(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	expectedFaculty := &domain.Faculty{
		ID:       facultyID,
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(expectedFaculty, nil)

	faculty, err := service.GetFacultyByID(facultyID)

	assert.NoError(t, err)
	assert.NotNil(t, faculty)
	assert.Equal(t, facultyID, faculty.ID)
	assert.Equal(t, "Faculty of Computing", faculty.Name)
	mockFacultyRepo.AssertExpectations(t)
}

func TestGetFacultyByID_NotFound(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	mockFacultyRepo.On("GetFacultyByID", facultyID).Return(nil, nil)

	faculty, err := service.GetFacultyByID(facultyID)

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "faculty not found")
	mockFacultyRepo.AssertExpectations(t)
}

func TestListFaculties_Success(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	expectedFaculties := []domain.Faculty{
		{
			ID:       uuid.New(),
			Name:     "Faculty of Computing",
			Code:     "FOC",
			IsActive: true,
		},
		{
			ID:       uuid.New(),
			Name:     "Faculty of Engineering",
			Code:     "FOE",
			IsActive: true,
		},
	}

	mockFacultyRepo.On("ListFaculties", false).Return(expectedFaculties, nil)

	faculties, err := service.ListFaculties(false)

	assert.NoError(t, err)
	assert.Len(t, faculties, 2)
	mockFacultyRepo.AssertExpectations(t)
}

func TestGetFacultyLeaders_Success(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	expectedLeaders := []domain.FacultyLeadership{
		{
			FacultyID: facultyID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
		{
			FacultyID: facultyID,
			UserID:    uuid.New(),
			Role:      "Pro-Vice Chancellor",
			IsActive:  true,
		},
	}

	mockFacultyRepo.On("FacultyExists", facultyID).Return(true, nil)
	mockLeadershipRepo.On("GetLeadersByFacultyID", facultyID).Return(expectedLeaders, nil)

	leaders, err := service.GetFacultyLeaders(facultyID)

	assert.NoError(t, err)
	assert.Len(t, leaders, 2)
	mockFacultyRepo.AssertExpectations(t)
	mockLeadershipRepo.AssertExpectations(t)
}

func TestGetFacultyLeaders_FacultyNotFound(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	facultyID := uuid.New()
	mockFacultyRepo.On("FacultyExists", facultyID).Return(false, nil)

	leaders, err := service.GetFacultyLeaders(facultyID)

	assert.Error(t, err)
	assert.Nil(t, leaders)
	assert.Contains(t, err.Error(), "faculty not found")
	mockFacultyRepo.AssertExpectations(t)
}

func TestValidateCreateRequest_InvalidLeaderRole(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	req := &dto.CreateFacultyRequest{
		Name: "Faculty of Computing",
		Code: "FOC",
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: uuid.New(),
				Role:   "Dr",
			},
		},
	}

	faculty, err := service.CreateFaculty(req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "role must be between 3 and 100 characters")
}

func TestValidateCreateRequest_InvalidLeaderUserID(t *testing.T) {
	mockFacultyRepo := new(MockFacultyRepository)
	mockLeadershipRepo := new(MockFacultyLeadershipRepository)
	db := setupTestDB(t)
	logger := zap.NewNop()
	auditClient := client.NewAuditClient("http://localhost:8081", logger)

	service := NewFacultyService(db, mockFacultyRepo, mockLeadershipRepo, auditClient, logger)

	req := &dto.CreateFacultyRequest{
		Name: "Faculty of Computing",
		Code: "FOC",
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: uuid.Nil,
				Role:   "Dean",
			},
		},
	}

	faculty, err := service.CreateFaculty(req, 1, "admin@test.com", "127.0.0.1", "test-agent")

	assert.Error(t, err)
	assert.Nil(t, faculty)
	assert.Contains(t, err.Error(), "user_id is required")
}
