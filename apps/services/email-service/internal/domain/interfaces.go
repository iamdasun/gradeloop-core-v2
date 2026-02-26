package domain

import (
	"context"

	"github.com/google/uuid"
)

type EmailRepository interface {
	// Template operations
	CreateTemplate(ctx context.Context, template *EmailTemplate) error
	GetTemplate(ctx context.Context, id uuid.UUID) (*EmailTemplate, error)
	GetTemplateByName(ctx context.Context, name string) (*EmailTemplate, error)
	UpdateTemplate(ctx context.Context, template *EmailTemplate) error
	DeleteTemplate(ctx context.Context, id uuid.UUID) error
	ListTemplates(ctx context.Context) ([]EmailTemplate, error)

	// Message operations
	CreateMessage(ctx context.Context, message *EmailMessage) error
	GetMessage(ctx context.Context, id uuid.UUID) (*EmailMessage, error)
	UpdateMessageStatus(ctx context.Context, id uuid.UUID, status EmailStatus) error
	UpdateMessageRetry(ctx context.Context, id uuid.UUID, retryCount int) error

	// Recipient operations
	CreateRecipient(ctx context.Context, recipient *EmailRecipient) error
	UpdateRecipientStatus(ctx context.Context, id uuid.UUID, status RecipientStatus) error
	IncrementOpenCount(ctx context.Context, id uuid.UUID) error
	IncrementClickCount(ctx context.Context, id uuid.UUID) error
}

type EmailService interface {
	SendEmail(ctx context.Context, req *SendEmailRequest) (*EmailMessage, error)
	SendBulkEmail(ctx context.Context, req *BulkSendEmailRequest) error

	// Template methods
	CreateTemplate(ctx context.Context, req *CreateTemplateRequest) (*EmailTemplate, error)
	GetTemplate(ctx context.Context, id uuid.UUID) (*EmailTemplate, error)

	// Status methods
	GetEmailStatus(ctx context.Context, id uuid.UUID) (*EmailMessage, error)
	TrackOpen(ctx context.Context, recipientID uuid.UUID) error
	TrackClick(ctx context.Context, recipientID uuid.UUID) error
}

// DTOs for Service layer
type SendEmailRequest struct {
	TemplateName string
	Subject      string // Override or fallback
	BodyHTML     string // Custom HTML body
	BodyText     string // Custom text body
	Recipients   []string
	Variables    map[string]interface{}
	Attachments  []AttachmentDTO
}

type BulkSendEmailRequest struct {
	TemplateName string
	Recipients   []BulkRecipientDTO
}

type BulkRecipientDTO struct {
	Email     string
	Variables map[string]interface{}
}

type AttachmentDTO struct {
	Filename string
	URL      string
	MimeType string
	Size     int64
}

type CreateTemplateRequest struct {
	Name     string
	Subject  string
	BodyHTML string
	BodyText string
}
