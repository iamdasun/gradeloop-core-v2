package service

import (
	"context"

	"github.com/gradeloop/cipas-xai/internal/client"
	"github.com/gradeloop/cipas-xai/internal/dto"
	"go.uber.org/zap"
)

// ChatService handles chat operations
type ChatService struct {
	llmClient client.LLMClient
	logger    *zap.Logger
}

// NewChatService creates a new chat service
func NewChatService(llmClient client.LLMClient, logger *zap.Logger) *ChatService {
	return &ChatService{
		llmClient: llmClient,
		logger:    logger,
	}
}

// SendChat sends a chat request and returns the complete response
func (s *ChatService) SendChat(ctx context.Context, messages []dto.ChatMessage) (*dto.ChatResponse, error) {
	s.logger.Info("sending chat request", zap.Int("message_count", len(messages)))
	return s.llmClient.SendChat(ctx, messages)
}

// StreamChat sends a chat request and returns a channel for streaming chunks
func (s *ChatService) StreamChat(ctx context.Context, messages []dto.ChatMessage) (<-chan dto.StreamChunk, error) {
	s.logger.Info("starting chat stream", zap.Int("message_count", len(messages)))
	chunkChan := make(chan dto.StreamChunk, 64)
	go func() {
		if err := s.llmClient.StreamChat(ctx, messages, chunkChan); err != nil {
			s.logger.Error("stream chat error", zap.Error(err))
			chunkChan <- dto.StreamChunk{Done: true}
		}
	}()
	return chunkChan, nil
}
