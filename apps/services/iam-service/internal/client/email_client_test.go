package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewEmailClient(t *testing.T) {
	baseURL := "http://localhost:8082"
	client := NewEmailClient(baseURL)

	if client == nil {
		t.Fatal("expected client to be non-nil")
	}

	if client.baseURL != baseURL {
		t.Errorf("expected baseURL %s, got %s", baseURL, client.baseURL)
	}

	if client.httpClient == nil {
		t.Error("expected httpClient to be non-nil")
	}
}

func TestSendEmail_Success(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request method
		if r.Method != http.MethodPost {
			t.Errorf("expected POST request, got %s", r.Method)
		}

		// Verify request path
		if r.URL.Path != "/api/v1/email/send" {
			t.Errorf("expected path /api/v1/email/send, got %s", r.URL.Path)
		}

		// Verify content type
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}

		// Decode request body
		var req SendEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("failed to decode request: %v", err)
		}

		// Verify request data
		if len(req.Recipients) == 0 {
			t.Error("expected at least one recipient")
		}

		// Send success response
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(SendEmailResponse{
			Message: "Email queued for sending",
			ID:      "test-id-123",
			Status:  "pending",
		})
	}))
	defer server.Close()

	// Create client with mock server URL
	client := NewEmailClient(server.URL)

	// Test SendEmail
	req := &SendEmailRequest{
		TemplateName: "test_template",
		Recipients:   []string{"test@example.com"},
		Variables: map[string]interface{}{
			"name": "Test User",
		},
	}

	resp, err := client.SendEmail(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Message != "Email queued for sending" {
		t.Errorf("expected message 'Email queued for sending', got %s", resp.Message)
	}

	if resp.ID != "test-id-123" {
		t.Errorf("expected ID 'test-id-123', got %s", resp.ID)
	}

	if resp.Status != "pending" {
		t.Errorf("expected status 'pending', got %s", resp.Status)
	}
}

func TestSendEmail_NoRecipients(t *testing.T) {
	client := NewEmailClient("http://localhost:8082")

	req := &SendEmailRequest{
		TemplateName: "test_template",
		Recipients:   []string{},
	}

	_, err := client.SendEmail(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for empty recipients, got nil")
	}

	if err.Error() != "at least one recipient is required" {
		t.Errorf("expected 'at least one recipient is required' error, got: %v", err)
	}
}

func TestSendEmail_ServerError(t *testing.T) {
	// Create mock server that returns error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Error: "internal server error",
		})
	}))
	defer server.Close()

	client := NewEmailClient(server.URL)

	req := &SendEmailRequest{
		Recipients: []string{"test@example.com"},
	}

	_, err := client.SendEmail(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for server error, got nil")
	}
}

func TestSendActivationEmail_Success(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req SendEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("failed to decode request: %v", err)
		}

		// Verify template name
		if req.TemplateName != "user_activation" {
			t.Errorf("expected template 'user_activation', got %s", req.TemplateName)
		}

		// Verify variables
		if req.Variables["username"] != "testuser" {
			t.Errorf("expected username 'testuser', got %v", req.Variables["username"])
		}

		if req.Variables["activation_link"] != "http://localhost:3000/activate?token=abc123" {
			t.Errorf("expected activation_link, got %v", req.Variables["activation_link"])
		}

		// Verify recipient
		if len(req.Recipients) != 1 || req.Recipients[0] != "test@example.com" {
			t.Errorf("expected recipient 'test@example.com', got %v", req.Recipients)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(SendEmailResponse{
			Message: "Email queued for sending",
			ID:      "activation-123",
			Status:  "pending",
		})
	}))
	defer server.Close()

	client := NewEmailClient(server.URL)

	err := client.SendActivationEmail(
		context.Background(),
		"test@example.com",
		"testuser",
		"http://localhost:3000/activate?token=abc123",
	)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSendPasswordResetEmail_Success(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req SendEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("failed to decode request: %v", err)
		}

		// Verify template name
		if req.TemplateName != "password_reset" {
			t.Errorf("expected template 'password_reset', got %s", req.TemplateName)
		}

		// Verify variables
		if req.Variables["username"] != "testuser" {
			t.Errorf("expected username 'testuser', got %v", req.Variables["username"])
		}

		if req.Variables["reset_link"] != "http://localhost:3000/reset?token=xyz789" {
			t.Errorf("expected reset_link, got %v", req.Variables["reset_link"])
		}

		// Verify recipient
		if len(req.Recipients) != 1 || req.Recipients[0] != "test@example.com" {
			t.Errorf("expected recipient 'test@example.com', got %v", req.Recipients)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(SendEmailResponse{
			Message: "Email queued for sending",
			ID:      "reset-456",
			Status:  "pending",
		})
	}))
	defer server.Close()

	client := NewEmailClient(server.URL)

	err := client.SendPasswordResetEmail(
		context.Background(),
		"test@example.com",
		"testuser",
		"http://localhost:3000/reset?token=xyz789",
	)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSendEmail_ContextCancellation(t *testing.T) {
	// Create mock server with delay
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// This should not be reached due to context cancellation
		t.Error("request should be cancelled before reaching server")
	}))
	defer server.Close()

	client := NewEmailClient(server.URL)

	// Create cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	req := &SendEmailRequest{
		Recipients: []string{"test@example.com"},
	}

	_, err := client.SendEmail(ctx, req)
	if err == nil {
		t.Fatal("expected error for cancelled context, got nil")
	}
}
