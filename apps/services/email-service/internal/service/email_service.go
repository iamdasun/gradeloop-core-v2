package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/gradeloop/email-service/internal/domain"
	"gorm.io/datatypes"
)

type emailService struct {
	repo     domain.EmailRepository
	producer domain.EventProducer
}

func NewEmailService(repo domain.EmailRepository, producer domain.EventProducer) domain.EmailService {
	return &emailService{
		repo:     repo,
		producer: producer,
	}
}

func (s *emailService) SendEmail(ctx context.Context, req *domain.SendEmailRequest) (*domain.EmailMessage, error) {
	// 1. Resolve Template (if name provided)
	var templateID *uuid.UUID
	var subject string

	if req.TemplateName != "" {
		tmpl, err := s.repo.GetTemplateByName(ctx, req.TemplateName)
		if err != nil {
			return nil, fmt.Errorf("failed to get template: %w", err)
		}
		templateID = &tmpl.ID
		// Basic interpolation would happen here or in worker.
		// For now, we pass raw template data to worker.
		subject = tmpl.Subject
	} else {
		subject = req.Subject
	}

	// 2. Create EmailMessage in DB (Status: Pending)
	metaBytes, _ := json.Marshal(req.Variables)

	email := &domain.EmailMessage{
		TemplateID:     templateID,
		Status:         domain.StatusPending,
		RecipientCount: len(req.Recipients),
		Metadata:       datatypes.JSON(metaBytes),
	}

	if err := s.repo.CreateMessage(ctx, email); err != nil {
		return nil, fmt.Errorf("failed to create email message record: %w", err)
	}

	// 3. Create Recipients
	// 3. Create Recipients
	for _, r := range req.Recipients {
		recipient := &domain.EmailRecipient{
			MessageID: email.ID,
			Email:     r,
			Status:    domain.RecipientPending,
			CreatedAt: time.Now(),
		}

		if err := s.repo.CreateRecipient(ctx, recipient); err != nil {
			// Log error but continue? or fail?
			// For now, let's return error to be safe, though partial failure is tricky.
			//Ideally transactional, but let's keep it simple.
			return nil, fmt.Errorf("failed to create recipient: %w", err)
		}
	}

	// 4. Publish to Kafka (email.send)
	eventPayload := map[string]interface{}{
		"message_id":    email.ID,
		"template_id":   templateID,
		"template_name": req.TemplateName,
		"subject":       subject,
		"body_html":     req.BodyHTML,
		"body_text":     req.BodyText,
		"recipients":    req.Recipients,
		"variables":     req.Variables,
		"timestamp":     time.Now(),
	}

	if err := s.producer.Publish(ctx, "email.send", eventPayload); err != nil {
		return nil, fmt.Errorf("failed to publish to kafka: %w", err)
	}

	return email, nil
}

func (s *emailService) SendBulkEmail(ctx context.Context, req *domain.BulkSendEmailRequest) error {
	// Similar to SendEmail but loops through recipients and batches them.
	// For MVP, just loop and call internal logic or publish batch messages.
	return nil
}

func (s *emailService) CreateTemplate(ctx context.Context, req *domain.CreateTemplateRequest) (*domain.EmailTemplate, error) {
	tmpl := &domain.EmailTemplate{
		Name:     req.Name,
		Subject:  req.Subject,
		BodyHTML: req.BodyHTML,
		BodyText: req.BodyText,
		IsActive: true,
		Version:  1,
	}

	if err := s.repo.CreateTemplate(ctx, tmpl); err != nil {
		return nil, err
	}

	return tmpl, nil
}

func (s *emailService) GetTemplate(ctx context.Context, id uuid.UUID) (*domain.EmailTemplate, error) {
	return s.repo.GetTemplate(ctx, id)
}

func (s *emailService) GetEmailStatus(ctx context.Context, id uuid.UUID) (*domain.EmailMessage, error) {
	return s.repo.GetMessage(ctx, id)
}

func (s *emailService) TrackOpen(ctx context.Context, recipientID uuid.UUID) error {
	return s.repo.IncrementOpenCount(ctx, recipientID)
}

func (s *emailService) TrackClick(ctx context.Context, recipientID uuid.UUID) error {
	return s.repo.IncrementClickCount(ctx, recipientID)
}
