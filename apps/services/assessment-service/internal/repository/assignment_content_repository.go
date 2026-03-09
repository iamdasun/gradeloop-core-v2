package repository

import (
	"errors"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// AssignmentContentRepository handles persistence for the three supplementary
// content tables attached to an assignment: rubric criteria, test cases, and
// the single sample answer.  All mutating methods are designed to be called
// inside an existing GORM transaction when atomicity with the parent
// assignment row is required.
type AssignmentContentRepository interface {
	// \u2500\u2500 Rubric criteria \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
	CreateRubricCriteria(criteria []domain.AssignmentRubricCriterion) error
	ListRubricCriteria(assignmentID uuid.UUID) ([]domain.AssignmentRubricCriterion, error)
	DeleteRubricCriteria(assignmentID uuid.UUID) error

	// \u2500\u2500 Test cases \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
	CreateTestCases(testCases []domain.AssignmentTestCase) error
	ListTestCases(assignmentID uuid.UUID) ([]domain.AssignmentTestCase, error)
	DeleteTestCases(assignmentID uuid.UUID) error

	// \u2500\u2500 Sample answer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
	// UpsertSampleAnswer inserts or replaces the sample answer for an assignment.
	UpsertSampleAnswer(answer *domain.AssignmentSampleAnswer) error
	GetSampleAnswer(assignmentID uuid.UUID) (*domain.AssignmentSampleAnswer, error)
	DeleteSampleAnswer(assignmentID uuid.UUID) error
}

// assignmentContentRepository is the concrete GORM-backed implementation.
type assignmentContentRepository struct {
	db *gorm.DB
}

// NewAssignmentContentRepository creates a new AssignmentContentRepository.
// Pass a transaction *gorm.DB to have all writes participate in that transaction.
func NewAssignmentContentRepository(db *gorm.DB) AssignmentContentRepository {
	return &assignmentContentRepository{db: db}
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Rubric criteria
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

func (r *assignmentContentRepository) CreateRubricCriteria(criteria []domain.AssignmentRubricCriterion) error {
	if len(criteria) == 0 {
		return nil
	}
	return r.db.Create(&criteria).Error
}

func (r *assignmentContentRepository) ListRubricCriteria(assignmentID uuid.UUID) ([]domain.AssignmentRubricCriterion, error) {
	var criteria []domain.AssignmentRubricCriterion
	err := r.db.
		Where("assignment_id = ?", assignmentID).
		Order("order_index ASC, created_at ASC").
		Find(&criteria).Error
	return criteria, err
}

func (r *assignmentContentRepository) DeleteRubricCriteria(assignmentID uuid.UUID) error {
	return r.db.
		Where("assignment_id = ?", assignmentID).
		Delete(&domain.AssignmentRubricCriterion{}).Error
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Test cases
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

func (r *assignmentContentRepository) CreateTestCases(testCases []domain.AssignmentTestCase) error {
	if len(testCases) == 0 {
		return nil
	}
	return r.db.Create(&testCases).Error
}

func (r *assignmentContentRepository) ListTestCases(assignmentID uuid.UUID) ([]domain.AssignmentTestCase, error) {
	var testCases []domain.AssignmentTestCase
	err := r.db.
		Where("assignment_id = ?", assignmentID).
		Order("order_index ASC, created_at ASC").
		Find(&testCases).Error
	return testCases, err
}

func (r *assignmentContentRepository) DeleteTestCases(assignmentID uuid.UUID) error {
	return r.db.
		Where("assignment_id = ?", assignmentID).
		Delete(&domain.AssignmentTestCase{}).Error
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Sample answer
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// UpsertSampleAnswer performs a true PostgreSQL INSERT … ON CONFLICT DO UPDATE
// so the sample answer is always kept in sync with the latest save.
// There is at most one sample answer per assignment (unique index on assignment_id).
func (r *assignmentContentRepository) UpsertSampleAnswer(answer *domain.AssignmentSampleAnswer) error {
	return r.db.
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "assignment_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"language_id", "language", "code", "updated_at"}),
		}).
		Create(answer).Error
}

func (r *assignmentContentRepository) GetSampleAnswer(assignmentID uuid.UUID) (*domain.AssignmentSampleAnswer, error) {
	var answer domain.AssignmentSampleAnswer
	err := r.db.
		Where("assignment_id = ?", assignmentID).
		First(&answer).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &answer, nil
}

func (r *assignmentContentRepository) DeleteSampleAnswer(assignmentID uuid.UUID) error {
	return r.db.
		Where("assignment_id = ?", assignmentID).
		Delete(&domain.AssignmentSampleAnswer{}).Error
}
