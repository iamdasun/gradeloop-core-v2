package handler

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/cipas-xai/internal/dto"
	"github.com/gradeloop/cipas-xai/internal/service"
	"go.uber.org/zap"
)

// ChatHandler handles chat-related HTTP requests
type ChatHandler struct {
	chatService *service.ChatService
	logger      *zap.Logger
}

// NewChatHandler creates a new chat handler
func NewChatHandler(chatService *service.ChatService, logger *zap.Logger) *ChatHandler {
	return &ChatHandler{
		chatService: chatService,
		logger:      logger,
	}
}

// RegisterRoutes registers chat routes
func (h *ChatHandler) RegisterRoutes(app *fiber.App) {
	api := app.Group("/api/v1")
	api.Post("/chat", h.Chat)
	api.Post("/chat/stream", h.ChatStream)
}

// Chat handles non-streaming chat requests
// @Summary Send a chat message and get complete response
// @Description Send a chat message to the LLM and receive the complete response
// @Tags chat
// @Accept json
// @Produce json
// @Param request body dto.ChatRequest true "Chat request"
// @Success 200 {object} dto.ChatResponse
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/chat [post]
func (h *ChatHandler) Chat(c fiber.Ctx) error {
	var req dto.ChatRequest
	if err := c.Bind().JSON(&req); err != nil {
		h.logger.Warn("invalid chat request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if len(req.Messages) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Messages array cannot be empty",
		})
	}

	h.logger.Info("processing chat request",
		zap.Int("message_count", len(req.Messages)),
		zap.String("model", req.Model),
	)

	resp, err := h.chatService.SendChat(context.Background(), req.Messages)
	if err != nil {
		h.logger.Error("chat service error", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to process chat request",
		})
	}

	return c.JSON(resp)
}

// ChatStream handles streaming chat requests using Server-Sent Events
// @Summary Send a chat message and stream the response
// @Description Send a chat message to the LLM and receive a streamed response via SSE
// @Tags chat
// @Accept json
// @Produce plain
// @Param request body dto.ChatRequest true "Chat request"
// @Success 200 {string} text/event-stream
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/chat/stream [post]
func (h *ChatHandler) ChatStream(c fiber.Ctx) error {
	var req dto.ChatRequest
	if err := c.Bind().JSON(&req); err != nil {
		h.logger.Warn("invalid stream chat request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if len(req.Messages) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Messages array cannot be empty",
		})
	}

	h.logger.Info("processing stream chat request",
		zap.Int("message_count", len(req.Messages)),
		zap.String("model", req.Model),
	)

	// Set headers for SSE
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no") // Disable nginx buffering

	chunkChan, err := h.chatService.StreamChat(context.Background(), req.Messages)
	if err != nil {
		h.logger.Error("stream chat service error", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to process chat request",
		})
	}

	// Stream chunks to client
	for chunk := range chunkChan {
		data, err := json.Marshal(chunk)
		if err != nil {
			h.logger.Error("failed to marshal chunk", zap.Error(err))
			continue
		}

		// Write SSE formatted data
		if _, err := c.Write([]byte("data: " + string(data) + "\n\n")); err != nil {
			h.logger.Error("failed to write chunk", zap.Error(err))
			return nil
		}

		// Flush immediately using fasthttp's Write
		c.RequestCtx().WriteString("\n")

		if chunk.Done {
			break
		}
	}

	return nil
}
