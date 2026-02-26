package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type EmailStatus string

const (
	StatusPending    EmailStatus = "pending"
	StatusProcessing EmailStatus = "processing"
	StatusSent       EmailStatus = "sent"
	StatusFailed     EmailStatus = "failed"
	StatusDeadLetter EmailStatus = "dead_letter"
)

type RecipientStatus string

const (
	RecipientPending RecipientStatus = "pending"
	RecipientSent    RecipientStatus = "sent"
	RecipientFailed  RecipientStatus = "failed"
	RecipientBounced RecipientStatus = "bounced"
)

type EmailTemplate struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string         `gorm:"unique;not null" json:"name"`
	Subject   string         `gorm:"not null" json:"subject"`
	BodyHTML  string         `gorm:"not null" json:"body_html"`
	BodyText  string         `gorm:"not null" json:"body_text"`
	Variables datatypes.JSON `gorm:"type:jsonb" json:"variables"`
	Version   int            `json:"version"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt *time.Time     `gorm:"index" json:"deleted_at,omitempty"`
}

type EmailMessage struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TemplateID     *uuid.UUID     `json:"template_id,omitempty"`
	Status         EmailStatus    `gorm:"type:varchar(20);default:'pending';index" json:"status"`
	ScheduledAt    *time.Time     `gorm:"index" json:"scheduled_at,omitempty"`
	RetryCount     int            `gorm:"default:0" json:"retry_count"`
	RecipientCount int            `json:"recipient_count"`
	Metadata       datatypes.JSON `gorm:"type:jsonb" json:"metadata"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`

	Template    *EmailTemplate    `gorm:"foreignKey:TemplateID" json:"template,omitempty"`
	Recipients  []EmailRecipient  `gorm:"foreignKey:MessageID" json:"recipients,omitempty"`
	Attachments []EmailAttachment `gorm:"foreignKey:MessageID" json:"attachments,omitempty"`
	Logs        []EmailLog        `gorm:"foreignKey:MessageID" json:"logs,omitempty"`
}

type EmailRecipient struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	MessageID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"message_id"`
	Email      string          `gorm:"not null;index" json:"email"`
	Status     RecipientStatus `gorm:"type:varchar(20);default:'pending';index" json:"status"`
	OpenCount  int             `gorm:"default:0" json:"open_count"`
	ClickCount int             `gorm:"default:0" json:"click_count"`
	Metadata   datatypes.JSON  `gorm:"type:jsonb" json:"metadata"`
	CreatedAt  time.Time       `json:"created_at"`
}

type EmailAttachment struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	MessageID uuid.UUID `gorm:"type:uuid;not null;index" json:"message_id"`
	Filename  string    `gorm:"not null" json:"filename"`
	URL       string    `gorm:"not null" json:"url"`
	MimeType  string    `gorm:"not null" json:"mime_type"`
	Size      int64     `gorm:"not null" json:"size"`
	CreatedAt time.Time `json:"created_at"`
}

type EmailLog struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	MessageID uuid.UUID      `gorm:"type:uuid;not null;index" json:"message_id"`
	Event     string         `gorm:"not null" json:"event"`
	Details   datatypes.JSON `gorm:"type:jsonb" json:"details"`
	CreatedAt time.Time      `json:"created_at"`
}
