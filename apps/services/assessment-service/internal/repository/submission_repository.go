package repository

import (
	"errors"
	"time"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/dto"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SubmissionRepository defines all data operations for submissions.
type SubmissionRepository interface {
	// CreateSubmission inserts a new submission record.
	CreateSubmission(submission *domain.Submission) error

	// FindLatestSubmission returns the single submission with is_latest=true
	// for the given assignment+owner scope. Returns (nil, nil) when no
	// previous submission exists.
	FindLatestSubmission(assignmentID uuid.UUID, userID, groupID *uuid.UUID) (*domain.Submission, error)

	// MarkNotLatest sets is_latest=false on a specific submission row.
	MarkNotLatest(id uuid.UUID) error

	// GetSubmission loads a submission by its primary key.
	// Returns (nil, nil) when not found.
	GetSubmission(id uuid.UUID) (*domain.Submission, error)

	// ListSubmissions returns all submissions for the given assignment and
	// owner scope, ordered by version descending (newest first).
	ListSubmissions(assignmentID uuid.UUID, userID, groupID *uuid.UUID) ([]domain.Submission, error)

	// GetLatestSubmission returns the single submission with is_latest=true
	// for the given assignment and owner scope.
	GetLatestSubmission(assignmentID uuid.UUID, userID, groupID *uuid.UUID) (*domain.Submission, error)

	// UpdateStatus transitions a submission to the given status string.
	// It is called by the queue worker after a successful MinIO upload
	// to move the submission from "queued" to "pending".
	UpdateStatus(id uuid.UUID, status string) error

	// UpdateExecutionResults updates the submission with Judge0 execution results.
	// It is called by the queue worker after code execution.
	UpdateExecutionResults(submission *domain.Submission) error

	// UpdateAnalysis persists the CIPAS AI detection and semantic similarity
	// scores for a submission.  Called via PATCH /submissions/:id/analysis.
	UpdateAnalysis(id uuid.UUID, req *dto.UpdateAnalysisRequest) error
}

// submissionRepository is the concrete GORM-backed implementation.
type submissionRepository struct {
	db *gorm.DB
}

// NewSubmissionRepository creates a new submissionRepository.
func NewSubmissionRepository(db *gorm.DB) SubmissionRepository {
	return &submissionRepository{db: db}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateSubmission
// ─────────────────────────────────────────────────────────────────────────────

func (r *submissionRepository) CreateSubmission(submission *domain.Submission) error {
	return r.db.Create(submission).Error
}

// ─────────────────────────────────────────────────────────────────────────────
// FindLatestSubmission
// ─────────────────────────────────────────────────────────────────────────────

// FindLatestSubmission looks up the current is_latest=true row for the given
// (assignment_id, user_id) or (assignment_id, group_id) scope.
// It is used during the versioning flow to determine the next version number.
func (r *submissionRepository) FindLatestSubmission(
	assignmentID uuid.UUID,
	userID, groupID *uuid.UUID,
) (*domain.Submission, error) {
	var submission domain.Submission

	q := r.db.
		Where("assignment_id = ? AND is_latest = true", assignmentID)

	if userID != nil {
		q = q.Where("user_id = ?", *userID)
	} else if groupID != nil {
		q = q.Where("group_id = ?", *groupID)
	}

	err := q.First(&submission).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &submission, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// MarkNotLatest
// ─────────────────────────────────────────────────────────────────────────────

// MarkNotLatest sets is_latest=false on the submission with the given id.
// This is called before inserting the new version so that exactly one row
// per owner scope holds is_latest=true at any point in time.
func (r *submissionRepository) MarkNotLatest(id uuid.UUID) error {
	return r.db.
		Model(&domain.Submission{}).
		Where("id = ?", id).
		Update("is_latest", false).
		Error
}

// ─────────────────────────────────────────────────────────────────────────────
// GetSubmission
// ─────────────────────────────────────────────────────────────────────────────

// GetSubmission loads a submission by primary key.
// Returns (nil, nil) when no matching record exists.
func (r *submissionRepository) GetSubmission(id uuid.UUID) (*domain.Submission, error) {
	var submission domain.Submission

	err := r.db.
		Where("id = ?", id).
		First(&submission).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &submission, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListSubmissions
// ─────────────────────────────────────────────────────────────────────────────

// ListSubmissions returns all submission versions for the given
// assignment+owner scope ordered newest-first (version DESC).
func (r *submissionRepository) ListSubmissions(
	assignmentID uuid.UUID,
	userID, groupID *uuid.UUID,
) ([]domain.Submission, error) {
	var submissions []domain.Submission

	q := r.db.Where("assignment_id = ?", assignmentID)

	if userID != nil {
		q = q.Where("user_id = ?", *userID)
	} else if groupID != nil {
		q = q.Where("group_id = ?", *groupID)
	}

	err := q.Order("version DESC").Find(&submissions).Error
	if err != nil {
		return nil, err
	}

	return submissions, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateStatus
// ─────────────────────────────────────────────────────────────────────────────

// UpdateStatus sets the status column on the submission identified by id.
func (r *submissionRepository) UpdateStatus(id uuid.UUID, status string) error {
	return r.db.
		Model(&domain.Submission{}).
		Where("id = ?", id).
		Update("status", status).
		Error
}

// ─────────────────────────────────────────────────────────────────────────────
// GetLatestSubmission
// ─────────────────────────────────────────────────────────────────────────────

// GetLatestSubmission returns the submission with is_latest=true for the given
// assignment and owner scope.  Returns (nil, nil) when no submission has been
// made yet.
func (r *submissionRepository) GetLatestSubmission(
	assignmentID uuid.UUID,
	userID, groupID *uuid.UUID,
) (*domain.Submission, error) {
	var submission domain.Submission

	q := r.db.
		Where("assignment_id = ? AND is_latest = true", assignmentID)

	if userID != nil {
		q = q.Where("user_id = ?", *userID)
	} else if groupID != nil {
		q = q.Where("group_id = ?", *groupID)
	}

	err := q.First(&submission).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &submission, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateExecutionResults
// ─────────────────────────────────────────────────────────────────────────────

// UpdateExecutionResults updates the submission with Judge0 execution results.
// It updates all execution-related fields including stdout, stderr, compile output,
// execution status, time, memory, and test case results.
func (r *submissionRepository) UpdateExecutionResults(submission *domain.Submission) error {
	return r.db.
		Model(&domain.Submission{}).
		Where("id = ?", submission.ID).
		Updates(map[string]interface{}{
			"status":              submission.Status,
			"execution_stdout":    submission.ExecutionStdout,
			"execution_stderr":    submission.ExecutionStderr,
			"compile_output":      submission.CompileOutput,
			"execution_status":    submission.ExecutionStatus,
			"execution_status_id": submission.ExecutionStatusID,
			"execution_time":      submission.ExecutionTime,
			"memory_used":         submission.MemoryUsed,
			"test_cases_passed":   submission.TestCasesPassed,
			"total_test_cases":    submission.TotalTestCases,
			"test_case_results":   submission.TestCaseResults,
		}).
		Error
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateAnalysis
// ─────────────────────────────────────────────────────────────────────────────

// UpdateAnalysis persists CIPAS AI + semantic similarity results on a submission.
func (r *submissionRepository) UpdateAnalysis(id uuid.UUID, req *dto.UpdateAnalysisRequest) error {
	now := time.Now().UTC()
	updates := map[string]interface{}{
		"ai_likelihood":    req.AILikelihood,
		"human_likelihood": req.HumanLikelihood,
		"is_ai_generated":  req.IsAIGenerated,
		"ai_confidence":    req.AIConfidence,
		"analyzed_at":      now,
	}
	if req.SemanticSimilarityScore != nil {
		updates["semantic_similarity_score"] = *req.SemanticSimilarityScore
	}
	return r.db.
		Model(&domain.Submission{}).
		Where("id = ?", id).
		Updates(updates).
		Error
}
