package client

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gradeloop/cipas-xai/internal/dto"
	"go.uber.org/zap"
)

// LLMClient is an interface for LLM providers
type LLMClient interface {
	SendChat(ctx context.Context, messages []dto.ChatMessage) (*dto.ChatResponse, error)
	StreamChat(ctx context.Context, messages []dto.ChatMessage, chunkChan chan<- dto.StreamChunk) error
}

// OpenAIClient implements LLMClient for OpenAI-compatible APIs
type OpenAIClient struct {
	apiKey       string
	baseURL      string
	model        string
	maxTokens    int
	temperature  float64
	extraHeaders map[string]string
	httpClient   *http.Client
	logger       *zap.Logger
}

// NewOpenAIClient creates a new OpenAI-compatible client
func NewOpenAIClient(apiKey, baseURL, model string, maxTokens int, temperature float64, extraHeaders map[string]string, timeout time.Duration, logger *zap.Logger) *OpenAIClient {
	return &OpenAIClient{
		apiKey:       apiKey,
		baseURL:      baseURL,
		model:        model,
		maxTokens:    maxTokens,
		temperature:  temperature,
		extraHeaders: extraHeaders,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		logger: logger,
	}
}

// SendChat sends a chat request and returns the complete response
func (c *OpenAIClient) SendChat(ctx context.Context, messages []dto.ChatMessage) (*dto.ChatResponse, error) {
	// Convert messages to format suitable for API
	apiMessages := make([]map[string]interface{}, len(messages))
	for i, msg := range messages {
		apiMsg := map[string]interface{}{
			"role": msg.Role,
		}
		// Handle both string content and array content (for multi-modal)
		if contentArr := msg.GetContentAsArray(); len(contentArr) > 0 {
			// Multi-modal content
			contentItems := make([]map[string]interface{}, len(contentArr))
			for j, item := range contentArr {
				itemMap := map[string]interface{}{
					"type": item.Type,
				}
				if item.Text != "" {
					itemMap["text"] = item.Text
				}
				if item.ImageURL != nil && item.ImageURL.URL != "" {
					itemMap["image_url"] = map[string]interface{}{
						"url": item.ImageURL.URL,
					}
				}
				contentItems[j] = itemMap
			}
			apiMsg["content"] = contentItems
		} else {
			// Simple text content
			apiMsg["content"] = msg.GetContentAsString()
		}
		apiMessages[i] = apiMsg
	}

	reqBody := map[string]interface{}{
		"model":       c.model,
		"messages":    apiMessages,
		"max_tokens":  c.maxTokens,
		"temperature": c.temperature,
		"stream":      false,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	// Add extra headers (for OpenRouter, etc.)
	for key, value := range c.extraHeaders {
		req.Header.Set(key, value)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var apiResp struct {
		ID      string `json:"id"`
		Object  string `json:"object"`
		Created int64  `json:"created"`
		Model   string `json:"model"`
		Choices []struct {
			Index   int `json:"index"`
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	if len(apiResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return &dto.ChatResponse{
		ID:      apiResp.ID,
		Object:  apiResp.Object,
		Created: apiResp.Created,
		Model:   apiResp.Model,
		Content: apiResp.Choices[0].Message.Content,
		Usage: dto.Usage{
			PromptTokens:     apiResp.Usage.PromptTokens,
			CompletionTokens: apiResp.Usage.CompletionTokens,
			TotalTokens:      apiResp.Usage.TotalTokens,
		},
	}, nil
}

// StreamChat sends a chat request and streams the response chunks
func (c *OpenAIClient) StreamChat(ctx context.Context, messages []dto.ChatMessage, chunkChan chan<- dto.StreamChunk) error {
	defer close(chunkChan)

	// Convert messages to format suitable for API (same as SendChat)
	apiMessages := make([]map[string]interface{}, len(messages))
	for i, msg := range messages {
		apiMsg := map[string]interface{}{
			"role": msg.Role,
		}
		if contentArr := msg.GetContentAsArray(); len(contentArr) > 0 {
			contentItems := make([]map[string]interface{}, len(contentArr))
			for j, item := range contentArr {
				itemMap := map[string]interface{}{
					"type": item.Type,
				}
				if item.Text != "" {
					itemMap["text"] = item.Text
				}
				if item.ImageURL != nil && item.ImageURL.URL != "" {
					itemMap["image_url"] = map[string]interface{}{
						"url": item.ImageURL.URL,
					}
				}
				contentItems[j] = itemMap
			}
			apiMsg["content"] = contentItems
		} else {
			apiMsg["content"] = msg.GetContentAsString()
		}
		apiMessages[i] = apiMsg
	}

	reqBody := map[string]interface{}{
		"model":       c.model,
		"messages":    apiMessages,
		"max_tokens":  c.maxTokens,
		"temperature": c.temperature,
		"stream":      true,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	// Add extra headers (for OpenRouter, etc.)
	for key, value := range c.extraHeaders {
		req.Header.Set(key, value)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines and non-data lines
		if line == "" || line == "data: [DONE]" {
			if line == "data: [DONE]" {
				chunkChan <- dto.StreamChunk{Done: true}
			}
			continue
		}

		// Parse SSE data
		if len(line) > 6 && line[:6] == "data: " {
			line = line[6:]
		}

		var chunkData struct {
			ID      string `json:"id"`
			Object  string `json:"object"`
			Created int64  `json:"created"`
			Model   string `json:"model"`
			Choices []struct {
				Index int `json:"index"`
				Delta struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(line), &chunkData); err != nil {
			c.logger.Warn("failed to parse chunk", zap.Error(err), zap.String("line", line))
			continue
		}

		if len(chunkData.Choices) > 0 {
			chunk := dto.StreamChunk{
				ID:      chunkData.ID,
				Object:  chunkData.Object,
				Created: chunkData.Created,
				Model:   chunkData.Model,
				Content: chunkData.Choices[0].Delta.Content,
				Done:    chunkData.Choices[0].FinishReason != "",
			}
			chunkChan <- chunk
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("reading stream: %w", err)
	}

	return nil
}
