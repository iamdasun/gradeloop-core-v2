package migrations

import (
	"github.com/gradeloop/academic-service/internal/domain"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type Seeder struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewSeeder(db *gorm.DB, logger *zap.Logger) *Seeder {
	return &Seeder{
		db:     db,
		logger: logger,
	}
}

func (s *Seeder) Seed() error {
	s.logger.Info("starting seeder")

	if err := s.seedSemesters(); err != nil {
		return err
	}

	if err := s.seedPrograms(); err != nil {
		return err
	}

	if err := s.seedCourses(); err != nil {
		return err
	}

	s.logger.Info("seeder completed successfully")
	return nil
}

func (s *Seeder) seedSemesters() error {
	s.logger.Info("seeding semesters")

	var count int64
	if err := s.db.Model(&domain.Semester{}).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		s.logger.Info("semesters already seeded, skipping")
		return nil
	}

	semesters := []domain.Semester{
		{
			Name:      "Fall 2024",
			Year:      2024,
			StartDate: "2024-09-01",
			EndDate:   "2024-12-15",
			IsActive:  true,
		},
		{
			Name:      "Spring 2025",
			Year:      2025,
			StartDate: "2025-01-15",
			EndDate:   "2025-05-15",
			IsActive:  false,
		},
	}

	if err := s.db.Create(&semesters).Error; err != nil {
		return err
	}

	s.logger.Info("semesters seeded successfully")
	return nil
}

func (s *Seeder) seedPrograms() error {
	s.logger.Info("seeding programs")

	var count int64
	if err := s.db.Model(&domain.Program{}).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		s.logger.Info("programs already seeded, skipping")
		return nil
	}

	programs := []domain.Program{
		{
			Code:        "CS-BSC",
			Name:        "Bachelor of Science in Computer Science",
			Description: "Comprehensive computer science program",
			Duration:    8, // 8 semesters
		},
		{
			Code:        "SE-BSC",
			Name:        "Bachelor of Science in Software Engineering",
			Description: "Specialized software engineering program",
			Duration:    8,
		},
		{
			Code:        "IT-BSC",
			Name:        "Bachelor of Science in Information Technology",
			Description: "Information technology and systems program",
			Duration:    8,
		},
	}

	if err := s.db.Create(&programs).Error; err != nil {
		return err
	}

	s.logger.Info("programs seeded successfully")
	return nil
}

func (s *Seeder) seedCourses() error {
	s.logger.Info("seeding courses")

	var count int64
	if err := s.db.Model(&domain.Course{}).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		s.logger.Info("courses already seeded, skipping")
		return nil
	}

	courses := []domain.Course{
		{
			Code:        "CS101",
			Name:        "Introduction to Computer Science",
			Description: "Basic concepts of computer science and programming",
			Credits:     3,
		},
		{
			Code:        "CS201",
			Name:        "Data Structures and Algorithms",
			Description: "Fundamental data structures and algorithmic techniques",
			Credits:     4,
		},
		{
			Code:        "CS301",
			Name:        "Database Systems",
			Description: "Database design, implementation, and management",
			Credits:     3,
		},
		{
			Code:        "CS401",
			Name:        "Software Engineering",
			Description: "Software development methodologies and practices",
			Credits:     4,
		},
		{
			Code:        "MATH101",
			Name:        "Calculus I",
			Description: "Differential calculus and applications",
			Credits:     4,
		},
		{
			Code:        "MATH201",
			Name:        "Discrete Mathematics",
			Description: "Mathematical foundations for computer science",
			Credits:     3,
		},
	}

	if err := s.db.Create(&courses).Error; err != nil {
		return err
	}

	s.logger.Info("courses seeded successfully")
	return nil
}
