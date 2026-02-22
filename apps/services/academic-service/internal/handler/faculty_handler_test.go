package handler

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// MockFacultyService is a mock implementation of FacultyService
type MockFacultyService struct {
	mock.Mock
}

func (m *MockFacultyService) CreateFaculty(req *dto.CreateFacultyRequest, userID uint, email, ipAddress, userAgent string) (*domain.Faculty, error) {
	args := m.Called(req, userID, email, ipAddress, userAgent)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Faculty), args.Error(1)
}

func (m *MockFacultyService) UpdateFaculty(id uuid.UUID, req *dto.UpdateFacultyRequest, userID uint, email, ipAddress, userAgent string) (*domain.Faculty, error) {
	args := m.Called(id, req, userID, email, ipAddress, userAgent)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Faculty), args.Error(1)
}

func (m *MockFacultyService) DeactivateFaculty(id uuid.UUID, userID uint, email, ipAddress, userAgent string) error {
	args := m.Called(id, userID, email, ipAddress, userAgent)
	return args.Error(0)
}

func (m *MockFacultyService) GetFacultyByID(id uuid.UUID) (*domain.Faculty, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Faculty), args.Error(1)
}

func (m *MockFacultyService) ListFaculties(includeInactive bool) ([]domain.Faculty, error) {
	args := m.Called(includeInactive)
	return args.Get(0).([]domain.Faculty), args.Error(1)
}

func (m *MockFacultyService) GetFacultyLeaders(id uuid.UUID) ([]domain.FacultyLeadership, error) {
	args := m.Called(id)
	return args.Get(0).([]domain.FacultyLeadership), args.Error(1)
}

func setupTestApp(handler *FacultyHandler) *fiber.App {
	app := fiber.New()

	// Middleware to set user context
	app.Use(func(c fiber.Ctx) error {
		c.Locals("user_id", uint(1))
		c.Locals("email", "test@example.com")
		return c.Next()
	})

	app.Post("/faculties", handler.CreateFaculty)
	app.Get("/faculties", handler.ListFaculties)
	app.Get("/faculties/:id", handler.GetFaculty)
	app.Put("/faculties/:id", handler.UpdateFaculty)
	app.Patch("/faculties/:id/deactivate", handler.DeactivateFaculty)
	app.Get("/faculties/:id/leaders", handler.GetFacultyLeaders)

	return app
}

func TestCreateFaculty_Handler_Success(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

	facultyID := uuid.New()
	userID1 := uuid.New()

	requestBody := dto.CreateFacultyRequest{
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		Leaders: []dto.CreateLeadershipRequest{
			{
				UserID: userID1,
				Role:   "Dean",
			},
		},
	}

	expectedFaculty := &domain.Faculty{
		ID:          facultyID,
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		IsActive:    true,
	}

	mockService.On("CreateFaculty", mock.AnythingOfType("*dto.CreateFacultyRequest"), uint(1), "test@example.com", mock.Anything, mock.Anything).
		Return(expectedFaculty, nil)

	body, _ := json.Marshal(requestBody)
	req := httptest.NewRequest("POST", "/faculties", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusCreated, resp.StatusCode)

	var response dto.FacultyResponse
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, "Faculty of Computing", response.Name)
	assert.Equal(t, "FOC", response.Code)

	mockService.AssertExpectations(t)
}

func TestCreateFaculty_Handler_InvalidRequest(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

	req := httptest.NewRequest("POST", "/faculties", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestListFaculties_Handler_Success(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

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

	mockService.On("ListFaculties", false).Return(expectedFaculties, nil)

	req := httptest.NewRequest("GET", "/faculties?include_inactive=false", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, float64(2), response["count"])

	mockService.AssertExpectations(t)
}

func TestGetFaculty_Handler_Success(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

	facultyID := uuid.New()
	expectedFaculty := &domain.Faculty{
		ID:       facultyID,
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	mockService.On("GetFacultyByID", facultyID).Return(expectedFaculty, nil)

	req := httptest.NewRequest("GET", "/faculties/"+facultyID.String(), nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response dto.FacultyResponse
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, facultyID, response.ID)
	assert.Equal(t, "Faculty of Computing", response.Name)

	mockService.AssertExpectations(t)
}

func TestGetFaculty_Handler_InvalidID(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

	req := httptest.NewRequest("GET", "/faculties/invalid-uuid", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestUpdateFaculty_Handler_Success(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

	facultyID := uuid.New()
	requestBody := dto.UpdateFacultyRequest{
		Name:        "Updated Faculty Name",
		Description: "Updated description",
	}

	updatedFaculty := &domain.Faculty{
		ID:          facultyID,
		Name:        "Updated Faculty Name",
		Code:        "FOC",
		Description: "Updated description",
		IsActive:    true,
	}

	mockService.On("UpdateFaculty", facultyID, mock.AnythingOfType("*dto.UpdateFacultyRequest"), uint(1), "test@example.com", mock.Anything, mock.Anything).
		Return(updatedFaculty, nil)

	body, _ := json.Marshal(requestBody)
	req := httptest.NewRequest("PUT", "/faculties/"+facultyID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response dto.FacultyResponse
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, "Updated Faculty Name", response.Name)

	mockService.AssertExpectations(t)
}

func TestDeactivateFaculty_Handler_Success(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

	facultyID := uuid.New()
	mockService.On("DeactivateFaculty", facultyID, uint(1), "test@example.com", mock.Anything, mock.Anything).
		Return(nil)

	req := httptest.NewRequest("PATCH", "/faculties/"+facultyID.String()+"/deactivate", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response map[string]string
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, "faculty deactivated successfully", response["message"])

	mockService.AssertExpectations(t)
}

func TestGetFacultyLeaders_Handler_Success(t *testing.T) {
	mockService := new(MockFacultyService)
	logger := zap.NewNop()
	handler := NewFacultyHandler(mockService, logger)
	app := setupTestApp(handler)

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

	mockService.On("GetFacultyLeaders", facultyID).Return(expectedLeaders, nil)

	req := httptest.NewRequest("GET", "/faculties/"+facultyID.String()+"/leaders", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, float64(2), response["count"])

	mockService.AssertExpectations(t)
}
