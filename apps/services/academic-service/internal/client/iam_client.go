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

// IAMClient handles communication with the IAM service
type IAMClient struct {
	baseURL    string
	httpClient *http.Client
}

// ValidateTokenRequest represents the request to validate a token
type ValidateTokenRequest struct {
	Token string `json:"token"`
}

// ValidateTokenResponse represents the response from token validation
type ValidateTokenResponse struct {
	Valid       bool     `json:"valid"`
	UserID      uint     `json:"user_id"`
	Email       string   `json:"email"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}

// UserInfoResponse represents user information from IAM service
type UserInfoResponse struct {
	ID        uint     `json:"id"`
	Email     string   `json:"email"`
	FirstName string   `json:"first_name"`
	LastName  string   `json:"last_name"`
	IsActive  bool     `json:"is_active"`
	Roles     []string `json:"roles"`
}

// IAMErrorResponse represents an error response from IAM service
type IAMErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Error   string `json:"error"`
}

// NewIAMClient creates a new IAM client instance
func NewIAMClient(baseURL string) *IAMClient {
	return &IAMClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ValidateToken validates a JWT token with the IAM service
func (c *IAMClient) ValidateToken(ctx context.Context, token string) (*ValidateTokenResponse, error) {
	req := &ValidateTokenRequest{
		Token: token,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v1/auth/validate", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp IAMErrorResponse
		if err := json.Unmarshal(respBody, &errResp); err != nil {
			return nil, fmt.Errorf("IAM service returned status %d: %s", resp.StatusCode, string(respBody))
		}
		return nil, fmt.Errorf("IAM service error: %s", errResp.Message)
	}

	var validateResp ValidateTokenResponse
	if err := json.Unmarshal(respBody, &validateResp); err != nil {
		return nil, fmt.Errorf("unmarshaling response: %w", err)
	}

	return &validateResp, nil
}

// GetUserInfo retrieves user information from IAM service
func (c *IAMClient) GetUserInfo(ctx context.Context, token string, userID uint) (*UserInfoResponse, error) {
	url := fmt.Sprintf("%s/api/v1/users/%d", c.baseURL, userID)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp IAMErrorResponse
		if err := json.Unmarshal(respBody, &errResp); err != nil {
			return nil, fmt.Errorf("IAM service returned status %d: %s", resp.StatusCode, string(respBody))
		}
		return nil, fmt.Errorf("IAM service error: %s", errResp.Message)
	}

	var userResp UserInfoResponse
	if err := json.Unmarshal(respBody, &userResp); err != nil {
		return nil, fmt.Errorf("unmarshaling response: %w", err)
	}

	return &userResp, nil
}

// VerifyPermission checks if a user has a specific permission
func (c *IAMClient) VerifyPermission(ctx context.Context, token string, permission string) (bool, error) {
	validateResp, err := c.ValidateToken(ctx, token)
	if err != nil {
		return false, err
	}

	if !validateResp.Valid {
		return false, nil
	}

	for _, p := range validateResp.Permissions {
		if p == permission {
			return true, nil
		}
	}

	return false, nil
}

// VerifyRole checks if a user has a specific role
func (c *IAMClient) VerifyRole(ctx context.Context, token string, role string) (bool, error) {
	validateResp, err := c.ValidateToken(ctx, token)
	if err != nil {
		return false, err
	}

	if !validateResp.Valid {
		return false, nil
	}

	for _, r := range validateResp.Roles {
		if r == role {
			return true, nil
		}
	}

	return false, nil
}
