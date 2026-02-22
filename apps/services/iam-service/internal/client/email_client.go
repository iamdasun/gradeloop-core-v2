package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EmailClient handles communication with the email service
type EmailClient struct {
	baseURL    string
	httpClient *http.Client
}

// SendEmailRequest represents the request to send an email
type SendEmailRequest struct {
	TemplateName string                 `json:"template_name,omitempty"`
	Subject      string                 `json:"subject,omitempty"`
	BodyHTML     string                 `json:"body_html,omitempty"`
	BodyText     string                 `json:"body_text,omitempty"`
	Recipients   []string               `json:"recipients"`
	Variables    map[string]interface{} `json:"variables,omitempty"`
}

// SendEmailResponse represents the response from email service
type SendEmailResponse struct {
	Message string `json:"message"`
	ID      string `json:"id"`
	Status  string `json:"status"`
}

// ErrorResponse represents an error response from email service
type ErrorResponse struct {
	Error string `json:"error"`
}

// NewEmailClient creates a new email client instance
func NewEmailClient(baseURL string) *EmailClient {
	return &EmailClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SendEmail sends an email via the email service
func (c *EmailClient) SendEmail(ctx context.Context, req *SendEmailRequest) (*SendEmailResponse, error) {
	if len(req.Recipients) == 0 {
		return nil, fmt.Errorf("at least one recipient is required")
	}

	// Marshal request body
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v1/email/send", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	// Handle non-2xx status codes
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp ErrorResponse
		if err := json.Unmarshal(respBody, &errResp); err != nil {
			return nil, fmt.Errorf("email service returned status %d: %s", resp.StatusCode, string(respBody))
		}
		return nil, fmt.Errorf("email service error: %s", errResp.Error)
	}

	// Parse successful response
	var emailResp SendEmailResponse
	if err := json.Unmarshal(respBody, &emailResp); err != nil {
		return nil, fmt.Errorf("unmarshaling response: %w", err)
	}

	return &emailResp, nil
}

// SendActivationEmail sends an account activation email
func (c *EmailClient) SendActivationEmail(ctx context.Context, email, username, activationLink string) error {
	req := &SendEmailRequest{
		TemplateName: "user_activation",
		Recipients:   []string{email},
		Variables: map[string]interface{}{
			"username":        username,
			"activation_link": activationLink,
			"link":            activationLink,
		},
	}

	_, err := c.SendEmail(ctx, req)
	if err != nil {
		return fmt.Errorf("sending activation email: %w", err)
	}

	return nil
}

// SendPasswordResetEmail sends a password reset email
func (c *EmailClient) SendPasswordResetEmail(ctx context.Context, email, username, resetLink string) error {
	req := &SendEmailRequest{
		TemplateName: "password_reset",
		Recipients:   []string{email},
		Variables: map[string]interface{}{
			"username":   username,
			"reset_link": resetLink,
			"link":       resetLink,
		},
	}

	_, err := c.SendEmail(ctx, req)
	if err != nil {
		return fmt.Errorf("sending password reset email: %w", err)
	}

	return nil
}
