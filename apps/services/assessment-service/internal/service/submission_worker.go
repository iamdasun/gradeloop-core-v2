package service

import (
	"context"
	"fmt"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/queue"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/repository"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/storage"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// SubmissionWorker
// ─────────────────────────────────────────────────────────────────────────────

// SubmissionWorker implements queue.JobProcessor.  For each SubmissionJob
// dequeued from RabbitMQ it:
//
//  1. Uploads the submitted code to MinIO at the pre-computed storage path.
//  2. Transitions the submission row from "queued" → "pending".
//  3. Executes code via Judge0 (if language_id is provided).
//  4. Evaluates test cases (if assignment has them).
//  5. Updates submission with execution results.
//  6. Emits an audit log entry.
//
// The worker is stateless beyond its dependencies and therefore safe to call
// concurrently from multiple goroutines (the consumer pool).
type SubmissionWorker struct {
	submissionRepo repository.SubmissionRepository
	assignmentRepo repository.AssignmentRepository
	storage        *storage.MinIOStorage
	auditClient    *client.AuditClient
	judge0Client   *client.Judge0Client
	evalService    EvaluationService
	db             *gorm.DB
	logger         *zap.Logger
}

// NewSubmissionWorker creates a SubmissionWorker and returns it as a
// queue.JobProcessor so it can be passed directly to NewSubmissionConsumer.
func NewSubmissionWorker(
	submissionRepo repository.SubmissionRepository,
	assignmentRepo repository.AssignmentRepository,
	storage *storage.MinIOStorage,
	auditClient *client.AuditClient,
	judge0Client *client.Judge0Client,
	evalService EvaluationService,
	db *gorm.DB,
	logger *zap.Logger,
) queue.JobProcessor {
	w := &SubmissionWorker{
		submissionRepo: submissionRepo,
		assignmentRepo: assignmentRepo,
		storage:        storage,
		auditClient:    auditClient,
		judge0Client:   judge0Client,
		evalService:    evalService,
		db:             db,
		logger:         logger,
	}
	return w.Process
}

// Process is the queue.JobProcessor implementation.  It is called once per
// dequeued message and must return nil on success (causing an ACK) or a
// non-nil error on failure (causing a NACK and possible requeue).
func (w *SubmissionWorker) Process(ctx context.Context, job queue.SubmissionJob) error {
	logger := w.logger.With(
		zap.String("submission_id", job.SubmissionID.String()),
		zap.String("assignment_id", job.AssignmentID.String()),
		zap.String("language", job.Language),
	)

	// ── Step 1: Verify the submission row still exists ───────────────────────
	// In the extremely unlikely event that the row was deleted between enqueue
	// and processing (e.g. manual cleanup), skip silently rather than failing.
	sub, err := w.submissionRepo.GetSubmission(job.SubmissionID)
	if err != nil {
		return fmt.Errorf("worker: fetching submission %s: %w", job.SubmissionID, err)
	}
	if sub == nil {
		logger.Warn("worker: submission row not found; skipping job")
		return nil // ACK — nothing to do
	}

	// If the submission has already moved past "queued" (e.g. a duplicate
	// delivery after a crash), skip processing to stay idempotent.
	if sub.Status != string(domain.SubmissionStatusQueued) {
		logger.Info("worker: submission already processed; skipping duplicate delivery",
			zap.String("current_status", sub.Status),
		)
		return nil // ACK
	}

	// ── Step 2: Upload code to MinIO ─────────────────────────────────────────
	// UploadSubmission generates the same deterministic path that was pre-
	// computed during the HTTP request:
	//   submissions/{assignment_id}/{submission_id}/code.txt
	// We pass the IDs explicitly so the path is identical.
	uploadedPath, err := w.storage.UploadSubmission(
		ctx,
		job.SubmissionID.String(),
		job.AssignmentID.String(),
		job.Code,
	)
	if err != nil {
		logger.Error("worker: MinIO upload failed", zap.Error(err))
		return fmt.Errorf("worker: uploading submission %s to MinIO: %w", job.SubmissionID, err)
	}

	logger.Info("worker: code uploaded to MinIO", zap.String("path", uploadedPath))

	// ── Step 3: Transition submission status to "pending" ────────────────────
	// "pending" means the code is safely in object storage and ready to be
	// picked up by a judge (e.g. Judge0) for evaluation.
	if err := w.submissionRepo.UpdateStatus(
		job.SubmissionID,
		string(domain.SubmissionStatusPending),
	); err != nil {
		// The upload already succeeded — log a critical error so operators can
		// manually fix the status, but return the error so the message is
		// requeued and retried (UpdateStatus is idempotent).
		logger.Error("worker: failed to update submission status to pending",
			zap.Error(err),
		)
		return fmt.Errorf("worker: updating status for submission %s: %w", job.SubmissionID, err)
	}

	logger.Info("worker: submission status updated to pending")

	// ── Step 4: Execute via Judge0 (if language_id is provided) ───────────────
	if job.LanguageID > 0 {
		logger.Info("worker: executing submission via Judge0",
			zap.Int("language_id", job.LanguageID),
		)

		execResult, err := w.judge0Client.CreateSubmission(ctx, client.Judge0SubmissionRequest{
			SourceCode: job.Code,
			LanguageID: job.LanguageID,
			Stdin:      "", // No stdin for initial execution
		})

		if err != nil {
			logger.Error("worker: Judge0 execution failed", zap.Error(err))
			// Update status to error but don't fail the job
			if updateErr := w.submissionRepo.UpdateStatus(
				job.SubmissionID,
				string(domain.SubmissionStatusError),
			); updateErr != nil {
				logger.Error("worker: failed to update submission status to error", zap.Error(updateErr))
			}
		} else {
			// Update submission with execution results
			executionUpdate := &domain.Submission{
				ID:                job.SubmissionID,
				ExecutionStdout:   execResult.Stdout,
				ExecutionStderr:   execResult.Stderr,
				CompileOutput:     execResult.CompileOutput,
				ExecutionStatus:   execResult.Status.Description,
				ExecutionStatusID: execResult.Status.ID,
				ExecutionTime:     execResult.Time,
				MemoryUsed:        execResult.Memory,
			}

			// Determine final status based on Judge0 result
			finalStatus := string(domain.SubmissionStatusAccepted)
			if !client.IsSuccessfulExecution(execResult.Status.ID) {
				finalStatus = string(domain.SubmissionStatusRejected)
			}
			executionUpdate.Status = finalStatus

			// ── Step 5: Evaluate test cases (if assignment has them) ────────────
			assignment, err := w.assignmentRepo.GetAssignmentByID(job.AssignmentID)
			if err == nil && assignment != nil {
				// TODO: Load test cases from assignment when test case storage is implemented
				// For now, skip test case evaluation
				_ = assignment
			}

			// Update submission with execution results
			if updateErr := w.submissionRepo.UpdateExecutionResults(executionUpdate); updateErr != nil {
				logger.Error("worker: failed to update execution results",
					zap.Error(updateErr),
				)
			} else {
				logger.Info("worker: execution results saved",
					zap.String("status", execResult.Status.Description),
					zap.String("time", execResult.Time),
				)
			}
		}
	}

	// ── Step 6: Emit audit log ───────────────────────────────────────────────
	// Audit logging is best-effort — a failure here must not cause the message
	// to be requeued, because the code is already uploaded and the status is
	// already updated.
	changes := map[string]interface{}{
		"assignment_id": job.AssignmentID.String(),
		"status_from":   string(domain.SubmissionStatusQueued),
		"status_to":     string(domain.SubmissionStatusPending),
		"storage_path":  uploadedPath,
		"language":      job.Language,
		"language_id":   job.LanguageID,
	}

	if auditErr := w.auditClient.LogAction(
		string(client.AuditActionSubmissionCreated),
		"submission",
		job.SubmissionID.String(),
		0,
		job.Username,
		changes,
		nil,
		job.IPAddress,
		job.UserAgent,
	); auditErr != nil {
		logger.Warn("worker: failed to write audit log for submission", zap.Error(auditErr))
	}

	logger.Info("worker: submission job completed successfully")
	return nil
}
