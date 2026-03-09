package dto

// MessageContent represents a single content item in a message (text or image)
type MessageContent struct {
	Type     string    `json:"type"` // "text" or "image_url"
	Text     string    `json:"text,omitempty"`
	ImageURL *ImageURL `json:"image_url,omitempty"`
}

// ImageURL represents an image URL in a message
type ImageURL struct {
	URL string `json:"url"`
}

// ChatMessage represents a single message in a chat conversation
type ChatMessage struct {
	Role    string      `json:"role"`    // "system", "user", or "assistant"
	Content interface{} `json:"content"` // Can be string or []MessageContent
}

// GetContentAsString returns content as a string if it's a simple text message
func (m *ChatMessage) GetContentAsString() string {
	if content, ok := m.Content.(string); ok {
		return content
	}
	return ""
}

// GetContentAsArray returns content as an array of MessageContent for multi-modal messages
func (m *ChatMessage) GetContentAsArray() []MessageContent {
	if content, ok := m.Content.([]interface{}); ok {
		var result []MessageContent
		for _, item := range content {
			if itemMap, ok := item.(map[string]interface{}); ok {
				msgContent := MessageContent{
					Type: getStringValue(itemMap, "type"),
					Text: getStringValue(itemMap, "text"),
				}
				if imageURL, ok := itemMap["image_url"].(map[string]interface{}); ok {
					msgContent.ImageURL = &ImageURL{
						URL: getStringValue(imageURL, "url"),
					}
				}
				result = append(result, msgContent)
			}
		}
		return result
	}
	return nil
}

// getStringValue safely gets a string value from a map
func getStringValue(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// ChatRequest represents the request body for chat endpoint
type ChatRequest struct {
	Messages     []ChatMessage     `json:"messages"`                // Array of chat messages
	Model        string            `json:"model,omitempty"`         // Optional model override
	Stream       bool              `json:"stream,omitempty"`        // Whether to stream the response
	MaxTokens    int               `json:"max_tokens,omitempty"`    // Optional max tokens override
	ExtraHeaders map[string]string `json:"extra_headers,omitempty"` // Extra headers for providers like OpenRouter
}

// ChatResponse represents a non-streaming chat response
type ChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Content string `json:"content"`
	Usage   Usage  `json:"usage,omitempty"`
}

// Usage represents token usage statistics
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// StreamChunk represents a single chunk in a streaming response
type StreamChunk struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Content string `json:"content"`
	Done    bool   `json:"done"`
}
