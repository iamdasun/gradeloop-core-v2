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

// SendEnrollmentConfirmationEmail sends an enrollment confirmation email to a student
func (c *EmailClient) SendEnrollmentConfirmationEmail(ctx context.Context, email, studentName, courseName string) error {
	req := &SendEmailRequest{
		TemplateName: "enrollment_confirmation",
		Recipients:   []string{email},
		Variables: map[string]interface{}{
			"student_name": studentName,
			"course_name":  courseName,
		},
	}

	_, err := c.SendEmail(ctx, req)
	if err != nil {
		return fmt.Errorf("sending enrollment confirmation email: %w", err)
	}

	return nil
}

// SendGradeNotificationEmail sends a grade notification email to a student
func (c *EmailClient) SendGradeNotificationEmail(ctx context.Context, email, studentName, courseName, grade string) error {
	req := &SendEmailRequest{
		TemplateName: "grade_notification",
		Recipients:   []string{email},
		Variables: map[string]interface{}{
			"student_name": studentName,
			"course_name":  courseName,
			"grade":        grade,
		},
	}

	_, err := c.SendEmail(ctx, req)
	if err != nil {
		return fmt.Errorf("sending grade notification email: %w", err)
	}

	return nil
}

// SendSemesterStartNotificationEmail sends a semester start notification email
func (c *EmailClient) SendSemesterStartNotificationEmail(ctx context.Context, email, studentName, semesterName string) error {
	req := &SendEmailRequest{
		TemplateName: "semester_start",
		Recipients:   []string{email},
		Variables: map[string]interface{}{
			"student_name":  studentName,
			"semester_name": semesterName,
		},
	}

	_, err := c.SendEmail(ctx, req)
	if err != nil {
		return fmt.Errorf("sending semester start notification email: %w", err)
	}

	return nil
}
