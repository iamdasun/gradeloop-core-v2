package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)

	err = db.AutoMigrate(&domain.Faculty{}, &domain.FacultyLeadership{})
	require.NoError(t, err)

	return db
}

func TestCreateFaculty(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		IsActive:    true,
	}

	err := repo.CreateFaculty(faculty)
	assert.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, faculty.ID)
	assert.False(t, faculty.CreatedAt.IsZero())
}

func TestCreateFaculty_DuplicateCode(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty1 := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := repo.CreateFaculty(faculty1)
	require.NoError(t, err)

	faculty2 := &domain.Faculty{
		Name:     "Faculty of Computer Science",
		Code:     "FOC",
		IsActive: true,
	}

	err = repo.CreateFaculty(faculty2)
	assert.Error(t, err)
}

func TestUpdateFaculty(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		IsActive:    true,
	}

	err := repo.CreateFaculty(faculty)
	require.NoError(t, err)

	faculty.Name = "Faculty of Information Technology"
	faculty.Description = "IT Faculty"

	err = repo.UpdateFaculty(faculty)
	assert.NoError(t, err)

	retrieved, err := repo.GetFacultyByID(faculty.ID)
	require.NoError(t, err)
	assert.Equal(t, "Faculty of Information Technology", retrieved.Name)
	assert.Equal(t, "IT Faculty", retrieved.Description)
}

func TestGetFacultyByID(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		IsActive:    true,
	}

	err := repo.CreateFaculty(faculty)
	require.NoError(t, err)

	retrieved, err := repo.GetFacultyByID(faculty.ID)
	assert.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Equal(t, faculty.ID, retrieved.ID)
	assert.Equal(t, faculty.Name, retrieved.Name)
	assert.Equal(t, faculty.Code, retrieved.Code)
}

func TestGetFacultyByID_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	retrieved, err := repo.GetFacultyByID(uuid.New())
	assert.NoError(t, err)
	assert.Nil(t, retrieved)
}

func TestGetFacultyByCode(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:        "Faculty of Computing",
		Code:        "FOC",
		Description: "Computing Faculty",
		IsActive:    true,
	}

	err := repo.CreateFaculty(faculty)
	require.NoError(t, err)

	retrieved, err := repo.GetFacultyByCode("FOC")
	assert.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Equal(t, faculty.ID, retrieved.ID)
	assert.Equal(t, "FOC", retrieved.Code)
}

func TestGetFacultyByCode_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	retrieved, err := repo.GetFacultyByCode("NONEXISTENT")
	assert.NoError(t, err)
	assert.Nil(t, retrieved)
}

func TestListFaculties(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculties := []domain.Faculty{
		{Name: "Faculty of Computing", Code: "FOC", IsActive: true},
		{Name: "Faculty of Engineering", Code: "FOE", IsActive: true},
		{Name: "Faculty of Medicine", Code: "FOM", IsActive: false},
	}

	for i := range faculties {
		err := repo.CreateFaculty(&faculties[i])
		require.NoError(t, err)
	}

	t.Run("list active only", func(t *testing.T) {
		retrieved, err := repo.ListFaculties(false)
		assert.NoError(t, err)
		assert.Len(t, retrieved, 2)
	})

	t.Run("list all including inactive", func(t *testing.T) {
		retrieved, err := repo.ListFaculties(true)
		assert.NoError(t, err)
		assert.Len(t, retrieved, 3)
	})
}

func TestSoftDeleteFaculty(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := repo.CreateFaculty(faculty)
	require.NoError(t, err)

	err = repo.SoftDeleteFaculty(faculty.ID)
	assert.NoError(t, err)

	retrieved, err := repo.GetFacultyByID(faculty.ID)
	assert.NoError(t, err)
	assert.Nil(t, retrieved)

	// Verify it's soft deleted in database
	var deletedFaculty domain.Faculty
	err = db.Unscoped().Where("id = ?", faculty.ID).First(&deletedFaculty).Error
	assert.NoError(t, err)
	assert.NotNil(t, deletedFaculty.DeletedAt)
}

func TestFacultyExists(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := repo.CreateFaculty(faculty)
	require.NoError(t, err)

	exists, err := repo.FacultyExists(faculty.ID)
	assert.NoError(t, err)
	assert.True(t, exists)

	exists, err = repo.FacultyExists(uuid.New())
	assert.NoError(t, err)
	assert.False(t, exists)
}

func TestCreateLeaders(t *testing.T) {
	db := setupTestDB(t)
	facultyRepo := NewFacultyRepository(db)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := facultyRepo.CreateFaculty(faculty)
	require.NoError(t, err)

	leaders := []domain.FacultyLeadership{
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Pro-Vice Chancellor",
			IsActive:  true,
		},
	}

	err = leadershipRepo.CreateLeaders(leaders)
	assert.NoError(t, err)
	assert.False(t, leaders[0].CreatedAt.IsZero())
	assert.False(t, leaders[1].CreatedAt.IsZero())
}

func TestGetLeadersByFacultyID(t *testing.T) {
	db := setupTestDB(t)
	facultyRepo := NewFacultyRepository(db)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := facultyRepo.CreateFaculty(faculty)
	require.NoError(t, err)

	leaders := []domain.FacultyLeadership{
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Pro-Vice Chancellor",
			IsActive:  true,
		},
	}

	err = leadershipRepo.CreateLeaders(leaders)
	require.NoError(t, err)

	retrieved, err := leadershipRepo.GetLeadersByFacultyID(faculty.ID)
	assert.NoError(t, err)
	assert.Len(t, retrieved, 2)
}

func TestDeleteLeadersByFacultyID(t *testing.T) {
	db := setupTestDB(t)
	facultyRepo := NewFacultyRepository(db)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := facultyRepo.CreateFaculty(faculty)
	require.NoError(t, err)

	leaders := []domain.FacultyLeadership{
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
	}

	err = leadershipRepo.CreateLeaders(leaders)
	require.NoError(t, err)

	err = leadershipRepo.DeleteLeadersByFacultyID(faculty.ID)
	assert.NoError(t, err)

	retrieved, err := leadershipRepo.GetLeadersByFacultyID(faculty.ID)
	assert.NoError(t, err)
	assert.Len(t, retrieved, 0)
}

func TestDeactivateLeadersByFacultyID(t *testing.T) {
	db := setupTestDB(t)
	facultyRepo := NewFacultyRepository(db)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := facultyRepo.CreateFaculty(faculty)
	require.NoError(t, err)

	leaders := []domain.FacultyLeadership{
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
	}

	err = leadershipRepo.CreateLeaders(leaders)
	require.NoError(t, err)

	err = leadershipRepo.DeactivateLeadersByFacultyID(faculty.ID)
	assert.NoError(t, err)

	// Verify soft deletion
	retrieved, err := leadershipRepo.GetLeadersByFacultyID(faculty.ID)
	assert.NoError(t, err)
	assert.Len(t, retrieved, 0)

	// Verify deleted_at is set
	var deletedLeader domain.FacultyLeadership
	err = db.Unscoped().Where("faculty_id = ?", faculty.ID).First(&deletedLeader).Error
	assert.NoError(t, err)
	assert.NotNil(t, deletedLeader.DeletedAt)
}

func TestFacultyWithLeaders_Preload(t *testing.T) {
	db := setupTestDB(t)
	facultyRepo := NewFacultyRepository(db)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := facultyRepo.CreateFaculty(faculty)
	require.NoError(t, err)

	leaders := []domain.FacultyLeadership{
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Pro-Vice Chancellor",
			IsActive:  true,
		},
	}

	err = leadershipRepo.CreateLeaders(leaders)
	require.NoError(t, err)

	retrieved, err := facultyRepo.GetFacultyByID(faculty.ID)
	assert.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Len(t, retrieved.Leaders, 2)
}

func TestListFaculties_WithLeaders(t *testing.T) {
	db := setupTestDB(t)
	facultyRepo := NewFacultyRepository(db)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := facultyRepo.CreateFaculty(faculty)
	require.NoError(t, err)

	leaders := []domain.FacultyLeadership{
		{
			FacultyID: faculty.ID,
			UserID:    uuid.New(),
			Role:      "Dean",
			IsActive:  true,
		},
	}

	err = leadershipRepo.CreateLeaders(leaders)
	require.NoError(t, err)

	faculties, err := facultyRepo.ListFaculties(false)
	assert.NoError(t, err)
	assert.Len(t, faculties, 1)
	assert.Len(t, faculties[0].Leaders, 1)
}

func TestSoftDeleteFaculty_DoesNotAffectListActive(t *testing.T) {
	db := setupTestDB(t)
	repo := NewFacultyRepository(db)

	faculty := &domain.Faculty{
		Name:     "Faculty of Computing",
		Code:     "FOC",
		IsActive: true,
	}

	err := repo.CreateFaculty(faculty)
	require.NoError(t, err)

	err = repo.SoftDeleteFaculty(faculty.ID)
	require.NoError(t, err)

	faculties, err := repo.ListFaculties(false)
	assert.NoError(t, err)
	assert.Len(t, faculties, 0)

	faculties, err = repo.ListFaculties(true)
	assert.NoError(t, err)
	assert.Len(t, faculties, 0)
}

func TestCreateLeaders_EmptySlice(t *testing.T) {
	db := setupTestDB(t)
	leadershipRepo := NewFacultyLeadershipRepository(db)

	err := leadershipRepo.CreateLeaders([]domain.FacultyLeadership{})
	assert.NoError(t, err)
}
