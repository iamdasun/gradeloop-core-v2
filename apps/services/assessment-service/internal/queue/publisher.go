package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

// ─────────────────────────────────────────────────────────────────────────────
// Message payload
// ─────────────────────────────────────────────────────────────────────────────

// SubmissionJob is the message payload written to the submission queue.
// It carries everything the consumer worker needs to complete the submission
// without touching the HTTP request context.
type SubmissionJob struct {
	// SubmissionID is the pre-generated UUID for the submission row that was
	// already inserted into the database with status="queued".
	SubmissionID uuid.UUID `json:"submission_id"`

	// AssignmentID identifies the assignment this code belongs to.
	AssignmentID uuid.UUID `json:"assignment_id"`

	// Code is the raw source code submitted by the student.
	Code string `json:"code"`

	// Language is the programming language identifier (e.g. "python", "go").
	Language string `json:"language"`

	// LanguageID is the Judge0 language ID for code execution.
	LanguageID int `json:"language_id"`

	// StoragePath is the deterministically computed MinIO object key that the
	// worker will upload the code to.  It matches the path already stored in
	// the DB row so no second update is needed after the upload.
	StoragePath string `json:"storage_path"`

	// Submitter metadata forwarded to the audit log.
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	IPAddress string `json:"ip_address"`
	UserAgent string `json:"user_agent"`

	// EnqueuedAt is set by the publisher so queue-latency metrics can be
	// derived without consulting the database.
	EnqueuedAt time.Time `json:"enqueued_at"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher
// ─────────────────────────────────────────────────────────────────────────────

// SubmissionPublisher publishes SubmissionJob messages to the submission queue.
// It holds a single AMQP channel and replaces it transparently whenever the
// broker reports the channel has been closed.
//
// All exported methods are safe for concurrent use.
type SubmissionPublisher struct {
	rmq    *RabbitMQ
	logger *zap.Logger
}

// NewSubmissionPublisher creates a SubmissionPublisher backed by rmq.
func NewSubmissionPublisher(rmq *RabbitMQ, logger *zap.Logger) *SubmissionPublisher {
	return &SubmissionPublisher{
		rmq:    rmq,
		logger: logger,
	}
}

// Publish serialises job as JSON and delivers it to the submission exchange
// with a persistent delivery mode so the message survives a broker restart.
//
// The method blocks until the broker confirms receipt (publisher confirms are
// enabled on every channel opened via RabbitMQ.Channel).  ctx is honoured for
// the confirmation wait — callers should pass a deadline-bounded context.
func (p *SubmissionPublisher) Publish(ctx context.Context, job SubmissionJob) error {
	job.EnqueuedAt = time.Now().UTC()

	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("submission publisher: marshalling job: %w", err)
	}

	// Open a fresh channel for each publish.  This is slightly more expensive
	// than reusing a single channel but eliminates the need for an additional
	// mutex and avoids channel-level errors (e.g. a previous Nack) from
	// blocking concurrent publishers.
	ch, err := p.rmq.Channel()
	if err != nil {
		return fmt.Errorf("submission publisher: acquiring channel: %w", err)
	}
	defer ch.Close()

	// Publisher confirms were enabled inside RabbitMQ.Channel(); register the
	// notification channel before publishing.
	confirms := ch.NotifyPublish(make(chan amqp.Confirmation, 1))

	err = ch.PublishWithContext(
		ctx,
		SubmissionExchange,   // exchange
		SubmissionRoutingKey, // routing key
		true,                 // mandatory — return if no queue is bound
		false,                // immediate — not supported by most brokers
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent, // survive broker restart
			MessageId:    job.SubmissionID.String(),
			Timestamp:    job.EnqueuedAt,
			Body:         body,
		},
	)
	if err != nil {
		return fmt.Errorf("submission publisher: publishing message for submission %s: %w",
			job.SubmissionID, err)
	}

	// Wait for the broker's acknowledgement or context cancellation.
	select {
	case confirm, ok := <-confirms:
		if !ok {
			return fmt.Errorf("submission publisher: confirms channel closed before ack for submission %s",
				job.SubmissionID)
		}
		if !confirm.Ack {
			return fmt.Errorf("submission publisher: broker nacked message for submission %s",
				job.SubmissionID)
		}

		p.logger.Info("submission job published",
			zap.String("submission_id", job.SubmissionID.String()),
			zap.String("assignment_id", job.AssignmentID.String()),
			zap.Uint64("delivery_tag", confirm.DeliveryTag),
		)

		return nil

	case <-ctx.Done():
		return fmt.Errorf("submission publisher: context cancelled while waiting for broker confirm: %w",
			ctx.Err())
	}
}
