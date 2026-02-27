package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/queue"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/repository"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/storage"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

// SubmissionService defines the business-logic contract for submission
// management including versioning, group validation, and code storage.
type SubmissionService interface {
	// CreateSubmission validates the request, versions the submission,
	// persists the metadata row with status="queued", and publishes the job
	// to the message queue for async MinIO upload.  Returns immediately with
	// the queued submission record so the HTTP handler can respond with 202.
	CreateSubmission(
		req *dto.CreateSubmissionRequest,
		userID uuid.UUID,
		username, ipAddress, userAgent string,
	) (*domain.Submission, error)

	// GetSubmission returns the metadata for a single submission.
	GetSubmission(id uuid.UUID) (*domain.Submission, error)

	// GetSubmissionCode returns the source code stored in MinIO for
	// the given submission.
	GetSubmissionCode(id uuid.UUID) (string, error)

	// ListSubmissions returns all submission versions for the given
	// assignment and owner scope, ordered newest-first.
	ListSubmissions(
		assignmentID uuid.UUID,
		userID, groupID *uuid.UUID,
	) ([]domain.Submission, error)

	// GetLatestSubmission returns the submission with is_latest=true for the
	// given assignment and owner scope.
	GetLatestSubmission(
		assignmentID uuid.UUID,
		userID, groupID *uuid.UUID,
	) (*domain.Submission, error)

	// RunCode executes code via Judge0 without creating a persistent submission.
	// Validates that the user is enrolled in the assignment's course.
	RunCode(
		ctx context.Context,
		req *dto.RunCodeRequest,
		userID uuid.UUID,
	) (*dto.RunCodeResponse, error)
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

type submissionService struct {
	submissionRepo repository.SubmissionRepository
	groupRepo      repository.GroupRepository
	assignmentRepo repository.AssignmentRepository
	storage        *storage.MinIOStorage
	publisher      *queue.SubmissionPublisher
	auditClient    *client.AuditClient
	academicClient *client.AcademicClient
	judge0Client   *client.Judge0Client
	maxPayloadSize int64
	db             *gorm.DB
	logger         *zap.Logger
}

// NewSubmissionService wires all dependencies and returns a SubmissionService.
func NewSubmissionService(
	submissionRepo repository.SubmissionRepository,
	groupRepo repository.GroupRepository,
	assignmentRepo repository.AssignmentRepository,
	storage *storage.MinIOStorage,
	publisher *queue.SubmissionPublisher,
	auditClient *client.AuditClient,
	academicClient *client.AcademicClient,
	judge0Client *client.Judge0Client,
	maxPayloadSize int64,
	db *gorm.DB,
	logger *zap.Logger,
) SubmissionService {
	return &submissionService{
		submissionRepo: submissionRepo,
		groupRepo:      groupRepo,
		assignmentRepo: assignmentRepo,
		storage:        storage,
		publisher:      publisher,
		auditClient:    auditClient,
		academicClient: academicClient,
		judge0Client:   judge0Client,
		maxPayloadSize: maxPayloadSize,
		db:             db,
		logger:         logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateSubmission
// ─────────────────────────────────────────────────────────────────────────────

// CreateSubmission is the async submission entry-point.
//
// Synchronous path (fast, happens inside the HTTP request):
//  1. Validate the request payload.
//  2. Load and validate the assignment (active, group-allowed, enrollment).
//  3. Determine the owner (individual user or group).
//  4. Run a DB transaction:
//     a. Compute the next version number.
//     b. Mark the previous latest submission as not-latest.
//     c. Pre-compute the deterministic MinIO storage path.
//     d. Insert the new submission row with status="queued".
//  5. Publish a SubmissionJob to RabbitMQ.
//  6. Return the queued submission — the handler responds with 202 Accepted.
//
// Async path (handled by the queue worker):
//  7. Worker uploads the code to MinIO at the pre-computed storage path.
//  8. Worker updates the submission status to "pending".
//  9. Worker emits the audit log entry.
func (s *submissionService) CreateSubmission(
	req *dto.CreateSubmissionRequest,
	userID uuid.UUID,
	username, ipAddress, userAgent string,
) (*domain.Submission, error) {
	// ── 1. Basic field validation ────────────────────────────────────────────
	if req.AssignmentID == uuid.Nil {
		return nil, utils.ErrBadRequest("assignment_id is required")
	}
	if req.Code == "" {
		return nil, utils.ErrBadRequest("code is required")
	}

	// ── 2. Load and validate the assignment ──────────────────────────────────
	assignment, err := s.assignmentRepo.GetAssignmentByID(req.AssignmentID)
	if err != nil {
		s.logger.Error("failed to load assignment for submission",
			zap.String("assignment_id", req.AssignmentID.String()),
			zap.Error(err),
		)
		return nil, utils.ErrInternal("failed to load assignment", err)
	}
	if assignment == nil {
		return nil, utils.ErrNotFound("assignment not found")
	}
	if !assignment.IsActive {
		return nil, utils.ErrBadRequest("assignment is not active")
	}

	// ── 3. Determine owner: exactly one of user_id or group_id must be set ───
	var ownerUserID *uuid.UUID
	var ownerGroupID *uuid.UUID

	if req.GroupID != nil {
		// ── Group submission path ────────────────────────────────────────────
		if !assignment.AllowGroupSubmission {
			return nil, utils.ErrBadRequest("assignment does not allow group submissions")
		}

		// Verify the group exists and belongs to this assignment.
		group, err := s.groupRepo.GetGroup(*req.GroupID)
		if err != nil {
			s.logger.Error("failed to load group",
				zap.String("group_id", req.GroupID.String()),
				zap.Error(err),
			)
			return nil, utils.ErrInternal("failed to load group", err)
		}
		if group == nil {
			return nil, utils.ErrBadRequest("invalid group: group not found")
		}
		if group.AssignmentID != req.AssignmentID {
			return nil, utils.ErrBadRequest("invalid group: group does not belong to this assignment")
		}

		// Verify the requesting user is a member of the group.
		if err := s.assertGroupMembership(group, userID.String()); err != nil {
			return nil, err
		}

		ownerGroupID = req.GroupID

	} else {
		// ── Individual submission path ────────────────────────────────────────
		// Check enrollment in the course instance that owns this assignment.
		enrolled, err := s.academicClient.IsEnrolled(
			userID.String(),
			assignment.CourseInstanceID.String(),
		)
		if err != nil {
			// Log the cross-service failure but do NOT block the submission —
			// a network hiccup with the academic service must not prevent a
			// student from submitting.  Log a warning and proceed.
			s.logger.Warn("enrollment check failed; proceeding without enrollment gate",
				zap.String("user_id", userID.String()),
				zap.String("course_instance_id", assignment.CourseInstanceID.String()),
				zap.Error(err),
			)
		} else if !enrolled {
			return nil, utils.ErrForbidden("not enrolled in the course instance for this assignment")
		}

		uid := userID
		ownerUserID = &uid
	}

	// ── 4. Run versioning + DB insert inside a transaction ───────────────────
	// The MinIO upload is intentionally NOT part of this transaction.
	// The storage path is computed deterministically from IDs we generate here,
	// so the worker can upload to the correct path without a second DB round-trip.
	var newSubmission *domain.Submission

	txErr := repository.WithTx(s.db, func(tx *gorm.DB) error {
		txSubmissionRepo := repository.NewSubmissionRepository(tx)

		// Step 4a: Find the current latest submission for this owner scope.
		latest, err := txSubmissionRepo.FindLatestSubmission(req.AssignmentID, ownerUserID, ownerGroupID)
		if err != nil {
			return fmt.Errorf("finding latest submission: %w", err)
		}

		// Step 4b: Compute the next version number.
		nextVersion := 1
		if latest != nil {
			nextVersion = latest.Version + 1
		}

		// Step 4c: Mark the previous latest submission as no longer latest.
		if latest != nil {
			if err := txSubmissionRepo.MarkNotLatest(latest.ID); err != nil {
				return fmt.Errorf("marking previous submission not-latest: %w", err)
			}
		}

		// Step 4d: Pre-compute the deterministic storage path.
		// This mirrors the path that MinIOStorage.UploadSubmission generates,
		// so the worker can upload to the exact same key without an extra update.
		submissionID := uuid.New()
		storagePath := fmt.Sprintf(
			"submissions/%s/%s/code.txt",
			req.AssignmentID.String(),
			submissionID.String(),
		)

		// Step 4e: Insert the new submission row with status="queued".
		newSubmission = &domain.Submission{
			ID:           submissionID,
			AssignmentID: req.AssignmentID,
			UserID:       ownerUserID,
			GroupID:      ownerGroupID,
			StoragePath:  storagePath,
			Language:     req.Language,
			LanguageID:   req.LanguageID,
			Status:       string(domain.SubmissionStatusQueued),
			Version:      nextVersion,
			IsLatest:     true,
		}

		if err := txSubmissionRepo.CreateSubmission(newSubmission); err != nil {
			return fmt.Errorf("creating submission record: %w", err)
		}

		return nil
	})

	if txErr != nil {
		s.logger.Error("submission transaction failed", zap.Error(txErr))
		return nil, utils.ErrInternal("failed to create submission", txErr)
	}

	// ── 5. Publish the job to RabbitMQ ───────────────────────────────────────
	// If publishing fails, the DB row already exists with status="queued".
	// Log the error and return the queued submission anyway so the client is
	// not blocked.  A separate reconciliation job (or manual retry) can pick
	// up stuck "queued" rows.
	job := queue.SubmissionJob{
		SubmissionID: newSubmission.ID,
		AssignmentID: req.AssignmentID,
		Code:         req.Code,
		Language:     req.Language,
		LanguageID:   req.LanguageID,
		StoragePath:  newSubmission.StoragePath,
		UserID:       userID.String(),
		Username:     username,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
	}

	publishCtx, cancel := context.WithTimeout(context.Background(), publishTimeout)
	defer cancel()

	if publishErr := s.publisher.Publish(publishCtx, job); publishErr != nil {
		s.logger.Error("failed to publish submission job to queue; submission remains queued",
			zap.String("submission_id", newSubmission.ID.String()),
			zap.Error(publishErr),
		)
		// Do NOT return an error — the submission record is already persisted
		// and can be replayed once the broker is healthy again.
	} else {
		s.logger.Info("submission job enqueued",
			zap.String("submission_id", newSubmission.ID.String()),
			zap.String("assignment_id", req.AssignmentID.String()),
			zap.Int("version", newSubmission.Version),
		)
	}

	return newSubmission, nil
}

// publishTimeout is the maximum time we allow for the broker to confirm a
// published submission message before we give up and log a warning.
const publishTimeout = 5 * time.Second

// ─────────────────────────────────────────────────────────────────────────────
// GetSubmission
// ─────────────────────────────────────────────────────────────────────────────

func (s *submissionService) GetSubmission(id uuid.UUID) (*domain.Submission, error) {
	sub, err := s.submissionRepo.GetSubmission(id)
	if err != nil {
		s.logger.Error("failed to load submission", zap.String("id", id.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to load submission", err)
	}
	if sub == nil {
		return nil, utils.ErrNotFound("submission not found")
	}
	return sub, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetSubmissionCode
// ─────────────────────────────────────────────────────────────────────────────

func (s *submissionService) GetSubmissionCode(id uuid.UUID) (string, error) {
	sub, err := s.submissionRepo.GetSubmission(id)
	if err != nil {
		s.logger.Error("failed to load submission for code retrieval",
			zap.String("id", id.String()), zap.Error(err))
		return "", utils.ErrInternal("failed to load submission", err)
	}
	if sub == nil {
		return "", utils.ErrNotFound("submission not found")
	}

	// A submission in "queued" status has not yet been uploaded to MinIO.
	// Return a descriptive error rather than attempting a doomed object fetch.
	if sub.Status == string(domain.SubmissionStatusQueued) {
		return "", utils.ErrBadRequest("submission code is not yet available; the submission is still being processed")
	}

	code, err := s.storage.GetSubmissionCode(context.Background(), sub.StoragePath)
	if err != nil {
		s.logger.Error("failed to retrieve submission code from storage",
			zap.String("id", id.String()),
			zap.String("storage_path", sub.StoragePath),
			zap.Error(err),
		)
		return "", utils.ErrInternal("failed to retrieve submission code", err)
	}

	return code, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListSubmissions
// ─────────────────────────────────────────────────────────────────────────────

func (s *submissionService) ListSubmissions(
	assignmentID uuid.UUID,
	userID, groupID *uuid.UUID,
) ([]domain.Submission, error) {
	if assignmentID == uuid.Nil {
		return nil, utils.ErrBadRequest("assignment_id is required")
	}
	if userID == nil && groupID == nil {
		return nil, utils.ErrBadRequest("one of user_id or group_id query parameter is required")
	}

	submissions, err := s.submissionRepo.ListSubmissions(assignmentID, userID, groupID)
	if err != nil {
		s.logger.Error("failed to list submissions",
			zap.String("assignment_id", assignmentID.String()),
			zap.Error(err),
		)
		return nil, utils.ErrInternal("failed to list submissions", err)
	}

	return submissions, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetLatestSubmission
// ─────────────────────────────────────────────────────────────────────────────

func (s *submissionService) GetLatestSubmission(
	assignmentID uuid.UUID,
	userID, groupID *uuid.UUID,
) (*domain.Submission, error) {
	if assignmentID == uuid.Nil {
		return nil, utils.ErrBadRequest("assignment_id is required")
	}
	if userID == nil && groupID == nil {
		return nil, utils.ErrBadRequest("one of user_id or group_id query parameter is required")
	}

	sub, err := s.submissionRepo.GetLatestSubmission(assignmentID, userID, groupID)
	if err != nil {
		s.logger.Error("failed to get latest submission",
			zap.String("assignment_id", assignmentID.String()),
			zap.Error(err),
		)
		return nil, utils.ErrInternal("failed to get latest submission", err)
	}
	if sub == nil {
		return nil, utils.ErrNotFound("no submission found")
	}

	return sub, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// assertGroupMembership verifies that memberID appears in the group's JSON
// members array.  Returns a 400 AppError when the user is not a member.
func (s *submissionService) assertGroupMembership(
	group *domain.SubmissionGroup,
	memberID string,
) error {
	var members []string
	if err := json.Unmarshal(group.Members, &members); err != nil {
		s.logger.Error("failed to unmarshal group members",
			zap.String("group_id", group.ID.String()),
			zap.Error(err),
		)
		return utils.ErrInternal("failed to validate group membership", err)
	}

	for _, m := range members {
		if m == memberID {
			return nil
		}
	}

	return utils.ErrBadRequest("invalid group: you are not a member of this group")
}

// ─────────────────────────────────────────────────────────────────────────────
// RunCode
// ─────────────────────────────────────────────────────────────────────────────

// RunCode executes code via Judge0 without creating a persistent submission.
// It validates that the user is enrolled in the assignment's course instance.
func (s *submissionService) RunCode(
	ctx context.Context,
	req *dto.RunCodeRequest,
	userID uuid.UUID,
) (*dto.RunCodeResponse, error) {
	// Validate request
	if req.AssignmentID == uuid.Nil {
		return nil, utils.ErrBadRequest("assignment_id is required")
	}
	if req.SourceCode == "" {
		return nil, utils.ErrBadRequest("source_code is required")
	}
	if req.LanguageID == 0 {
		return nil, utils.ErrBadRequest("language_id is required")
	}

	// Check payload size
	if int64(len(req.SourceCode)) > s.maxPayloadSize {
		return nil, utils.ErrBadRequest("source_code exceeds maximum allowed size")
	}

	// Load and validate the assignment
	assignment, err := s.assignmentRepo.GetAssignmentByID(req.AssignmentID)
	if err != nil {
		s.logger.Error("failed to load assignment for run-code",
			zap.String("assignment_id", req.AssignmentID.String()),
			zap.Error(err),
		)
		return nil, utils.ErrInternal("failed to load assignment", err)
	}
	if assignment == nil {
		return nil, utils.ErrNotFound("assignment not found")
	}
	if !assignment.IsActive {
		return nil, utils.ErrBadRequest("assignment is not active")
	}

	// Check enrollment
	enrolled, err := s.academicClient.IsEnrolled(
		userID.String(),
		assignment.CourseInstanceID.String(),
	)
	if err != nil {
		s.logger.Warn("enrollment check failed for run-code; proceeding without enrollment gate",
			zap.String("user_id", userID.String()),
			zap.String("course_instance_id", assignment.CourseInstanceID.String()),
			zap.Error(err),
		)
	} else if !enrolled {
		return nil, utils.ErrForbidden("not enrolled in the course instance for this assignment")
	}

	// Execute code via Judge0
	execResult, err := s.judge0Client.CreateSubmission(ctx, client.Judge0SubmissionRequest{
		SourceCode: req.SourceCode,
		LanguageID: req.LanguageID,
		Stdin:      req.Stdin,
	})
	if err != nil {
		s.logger.Error("judge0 execution failed",
			zap.String("user_id", userID.String()),
			zap.Int("language_id", req.LanguageID),
			zap.Error(err),
		)
		return nil, utils.ErrInternal("code execution failed", err)
	}

	return &dto.RunCodeResponse{
		Stdout:        execResult.Stdout,
		Stderr:        execResult.Stderr,
		CompileOutput: execResult.CompileOutput,
		ExecutionTime: execResult.Time,
		MemoryUsed:    execResult.Memory,
		Status:        execResult.Status.Description,
		StatusID:      execResult.Status.ID,
		Message:       execResult.Message,
	}, nil
}
