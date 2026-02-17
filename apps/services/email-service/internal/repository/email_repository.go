package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/gradeloop/email-service/internal/domain"
	"gorm.io/gorm"
)

type postgresRepository struct {
	db *gorm.DB
}

func NewPostgresRepository(db *gorm.DB) domain.EmailRepository {
	return &postgresRepository{db: db}
}

// Template Operations

func (r *postgresRepository) CreateTemplate(ctx context.Context, template *domain.EmailTemplate) error {
	return r.db.WithContext(ctx).Create(template).Error
}

func (r *postgresRepository) GetTemplate(ctx context.Context, id uuid.UUID) (*domain.EmailTemplate, error) {
	var template domain.EmailTemplate
	if err := r.db.WithContext(ctx).First(&template, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *postgresRepository) GetTemplateByName(ctx context.Context, name string) (*domain.EmailTemplate, error) {
	var template domain.EmailTemplate
	if err := r.db.WithContext(ctx).First(&template, "name = ? AND is_active = ?", name, true).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *postgresRepository) UpdateTemplate(ctx context.Context, template *domain.EmailTemplate) error {
	return r.db.WithContext(ctx).Save(template).Error
}

func (r *postgresRepository) DeleteTemplate(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.EmailTemplate{}, "id = ?", id).Error
}

func (r *postgresRepository) ListTemplates(ctx context.Context) ([]domain.EmailTemplate, error) {
	var templates []domain.EmailTemplate
	if err := r.db.WithContext(ctx).Find(&templates).Error; err != nil {
		return nil, err
	}
	return templates, nil
}

// Message Operations

func (r *postgresRepository) CreateMessage(ctx context.Context, message *domain.EmailMessage) error {
	return r.db.WithContext(ctx).Create(message).Error
}

func (r *postgresRepository) GetMessage(ctx context.Context, id uuid.UUID) (*domain.EmailMessage, error) {
	var message domain.EmailMessage
	if err := r.db.WithContext(ctx).Preload("Recipients").Preload("Template").Preload("Logs").First(&message, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &message, nil
}

func (r *postgresRepository) UpdateMessageStatus(ctx context.Context, id uuid.UUID, status domain.EmailStatus) error {
	return r.db.WithContext(ctx).Model(&domain.EmailMessage{}).Where("id = ?", id).Update("status", status).Error
}

func (r *postgresRepository) UpdateMessageRetry(ctx context.Context, id uuid.UUID, retryCount int) error {
	return r.db.WithContext(ctx).Model(&domain.EmailMessage{}).Where("id = ?", id).Update("retry_count", retryCount).Error
}

// Recipient Operations

func (r *postgresRepository) CreateRecipient(ctx context.Context, recipient *domain.EmailRecipient) error {
	return r.db.WithContext(ctx).Create(recipient).Error
}

func (r *postgresRepository) UpdateRecipientStatus(ctx context.Context, id uuid.UUID, status domain.RecipientStatus) error {
	return r.db.WithContext(ctx).Model(&domain.EmailRecipient{}).Where("id = ?", id).Update("status", status).Error
}

func (r *postgresRepository) IncrementOpenCount(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&domain.EmailRecipient{}).Where("id = ?", id).Update("open_count", gorm.Expr("open_count + 1")).Error
}

func (r *postgresRepository) IncrementClickCount(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&domain.EmailRecipient{}).Where("id = ?", id).Update("click_count", gorm.Expr("click_count + 1")).Error
}
