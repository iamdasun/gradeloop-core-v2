package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/gradeloop/email-service/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// Manual Mock for Repo
type MockRepo struct {
	mock.Mock
}

func (m *MockRepo) CreateTemplate(ctx context.Context, template *domain.EmailTemplate) error {
	args := m.Called(ctx, template)
	return args.Error(0)
}
func (m *MockRepo) GetTemplate(ctx context.Context, id uuid.UUID) (*domain.EmailTemplate, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.EmailTemplate), args.Error(1)
}
func (m *MockRepo) GetTemplateByName(ctx context.Context, name string) (*domain.EmailTemplate, error) {
	args := m.Called(ctx, name)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.EmailTemplate), args.Error(1)
}
func (m *MockRepo) UpdateTemplate(ctx context.Context, template *domain.EmailTemplate) error {
	return nil
}
func (m *MockRepo) DeleteTemplate(ctx context.Context, id uuid.UUID) error {
	return nil
}
func (m *MockRepo) ListTemplates(ctx context.Context) ([]domain.EmailTemplate, error) {
	return nil, nil
}
func (m *MockRepo) CreateMessage(ctx context.Context, message *domain.EmailMessage) error {
	args := m.Called(ctx, message)
	if message.ID == uuid.Nil {
		message.ID = uuid.New()
	}
	return args.Error(0)
}
func (m *MockRepo) GetMessage(ctx context.Context, id uuid.UUID) (*domain.EmailMessage, error) {
	return nil, nil
}
func (m *MockRepo) UpdateMessageStatus(ctx context.Context, id uuid.UUID, status domain.EmailStatus) error {
	return nil
}
func (m *MockRepo) UpdateMessageRetry(ctx context.Context, id uuid.UUID, retryCount int) error {
	return nil
}
func (m *MockRepo) CreateRecipient(ctx context.Context, recipient *domain.EmailRecipient) error {
	args := m.Called(ctx, recipient)
	return args.Error(0)
}
func (m *MockRepo) UpdateRecipientStatus(ctx context.Context, id uuid.UUID, status domain.RecipientStatus) error {
	return nil
}
func (m *MockRepo) IncrementOpenCount(ctx context.Context, id uuid.UUID) error {
	return nil
}
func (m *MockRepo) IncrementClickCount(ctx context.Context, id uuid.UUID) error {
	return nil
}

// We need to mock the producer, but since it's a struct pointer in the service,
// we might need to refactor Service to accept an Interface for Producer.
// However, for this simple test, we can skip testing the actual producer call if we can't mock it easily
// OR we can make a slight refactor to use an interface for the producer.
// Let's check the code: `producer *infraKafka.Producer`
// It uses a concrete type. This is hard to mock without refactoring.
// Refactoring to interface is cleaner.

// Mock Producer
type MockProducer struct {
	mock.Mock
}

func (m *MockProducer) Publish(ctx context.Context, topic string, message interface{}) error {
	args := m.Called(ctx, topic, message)
	return args.Error(0)
}

func (m *MockProducer) Close() error {
	return nil
}

func TestSendEmail_Success(t *testing.T) {
	mockRepo := new(MockRepo)
	mockProducer := new(MockProducer)

	svc := NewEmailService(mockRepo, mockProducer)

	ctx := context.Background()
	req := &domain.SendEmailRequest{
		Subject:    "Test Subject",
		Recipients: []string{"test@example.com"},
		Variables:  map[string]interface{}{"name": "User"},
	}

	// Expectations
	mockRepo.On("CreateMessage", ctx, mock.AnythingOfType("*domain.EmailMessage")).Return(nil)
	mockRepo.On("CreateRecipient", ctx, mock.AnythingOfType("*domain.EmailRecipient")).Return(nil)
	mockProducer.On("Publish", ctx, "email.send", mock.Anything).Return(nil)

	_, err := svc.SendEmail(ctx, req)

	assert.NoError(t, err)
	mockRepo.AssertExpectations(t)
	mockProducer.AssertExpectations(t)
}

func TestSendEmail_WithCustomBody(t *testing.T) {
	mockRepo := new(MockRepo)
	mockProducer := new(MockProducer)

	svc := NewEmailService(mockRepo, mockProducer)

	ctx := context.Background()
	req := &domain.SendEmailRequest{
		Subject:    "Custom Body Subject",
		Recipients: []string{"custom@example.com"},
		BodyHTML:   "<p>Custom HTML</p>",
		BodyText:   "Custom Text",
		Variables:  map[string]interface{}{},
	}

	// Expectations
	mockRepo.On("CreateMessage", ctx, mock.AnythingOfType("*domain.EmailMessage")).Return(nil)
	mockRepo.On("CreateRecipient", ctx, mock.AnythingOfType("*domain.EmailRecipient")).Return(nil)

	// Verify that published message contains body_html and body_text
	mockProducer.On("Publish", ctx, "email.send", mock.MatchedBy(func(payload map[string]interface{}) bool {
		return payload["body_html"] == "<p>Custom HTML</p>" && payload["body_text"] == "Custom Text"
	})).Return(nil)

	_, err := svc.SendEmail(ctx, req)

	assert.NoError(t, err)
	mockRepo.AssertExpectations(t)
	mockProducer.AssertExpectations(t)
}
