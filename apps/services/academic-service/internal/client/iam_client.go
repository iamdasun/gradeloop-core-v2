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
	ID          string `json:"id"`
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	AvatarURL   string `json:"avatar_url"`
	UserType    string `json:"user_type"`
	StudentID   string `json:"student_id"`
	Designation string `json:"designation"`
	IsActive    bool   `json:"is_active"`
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

// GetUserInfo retrieves user information by user ID
func (c *IAMClient) GetUserInfo(ctx context.Context, token, userID string) (*UserInfoResponse, error) {
	url := fmt.Sprintf("%s/api/v1/users/%s", c.baseURL, userID)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	// Forward the authorization token
	if token != "" {
		httpReq.Header.Set("Authorization", token)
	}

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

// GetUsersInfo retrieves information for multiple users by their IDs
func (c *IAMClient) GetUsersInfo(ctx context.Context, token string, userIDs []string) ([]UserInfoResponse, error) {
	if len(userIDs) == 0 {
		return []UserInfoResponse{}, nil
	}

	url := fmt.Sprintf("%s/api/v1/users/bulk", c.baseURL)
	reqBody := map[string][]string{"ids": userIDs}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if token != "" {
		httpReq.Header.Set("Authorization", token)
	}

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

	var usersResp struct {
		Users []UserInfoResponse `json:"users"`
	}
	if err := json.Unmarshal(respBody, &usersResp); err != nil {
		return nil, fmt.Errorf("unmarshaling response: %w", err)
	}

	return usersResp.Users, nil
}
