package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	stdhttp "net/http"
	"time"
)

type EmailClient interface {
	SendPasswordResetEmail(ctx context.Context, to, name, link string) error
	SendWelcomeEmail(ctx context.Context, to, name, password string) error
}

type emailClient struct {
	baseURL    string
	httpClient *stdhttp.Client
}

func NewEmailClient(baseURL string) EmailClient {
	return &emailClient{
		baseURL: baseURL,
		httpClient: &stdhttp.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *emailClient) SendPasswordResetEmail(ctx context.Context, to, name, link string) error {
	payload := map[string]interface{}{
		"recipients":    []string{to},
		"template_name": "password_reset",
		"variables": map[string]interface{}{
			"name":       name,
			"reset_link": link,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := stdhttp.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/v1/emails/send", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("email service returned status: %d", resp.StatusCode)
	}

	return nil
}

func (c *emailClient) SendWelcomeEmail(ctx context.Context, to, name, password string) error {
	payload := map[string]interface{}{
		"recipients":    []string{to},
		"template_name": "welcome_email",
		"variables": map[string]interface{}{
			"name":     name,
			"password": password,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := stdhttp.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/v1/emails/send", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("email service returned status: %d", resp.StatusCode)
	}

	return nil
}
