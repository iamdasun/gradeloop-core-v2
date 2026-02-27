package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// ─────────────────────────────────────────────────────────────────────────────
// Domain Types
// ─────────────────────────────────────────────────────────────────────────────

// Judge0ExecutionResult stores the parsed result from Judge0
type Judge0ExecutionResult struct {
	Stdout        string `json:"stdout"`
	Stderr        string `json:"stderr"`
	CompileOutput string `json:"compile_output"`
	Message       string `json:"message"`
	Status        struct {
		ID          int    `json:"id"`
		Description string `json:"description"`
	} `json:"status"`
	Time   string `json:"time"`
	Memory int    `json:"memory"`
	Token  string `json:"token"`
}

// Judge0SubmissionRequest represents the payload sent to Judge0
type Judge0SubmissionRequest struct {
	SourceCode string `json:"source_code"`
	LanguageID int    `json:"language_id"`
	Stdin      string `json:"stdin,omitempty"`
}

// Judge0Language represents a supported programming language
type Judge0Language struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Judge0Client
// ─────────────────────────────────────────────────────────────────────────────

// Judge0Client encapsulates all Judge0 API interactions
type Judge0Client struct {
	baseURL    string
	httpClient *http.Client
	apiKey     string
	logger     *zap.Logger
}

// NewJudge0Client creates a new Judge0 client
func NewJudge0Client(baseURL, apiKey string, timeout time.Duration, logger *zap.Logger) *Judge0Client {
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return &Judge0Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		apiKey: apiKey,
		logger: logger,
	}
}

// CreateSubmission submits code to Judge0 and waits for result (synchronous)
func (c *Judge0Client) CreateSubmission(ctx context.Context, req Judge0SubmissionRequest) (*Judge0ExecutionResult, error) {
	url := fmt.Sprintf("%s/submissions?base64_encoded=false&wait=true", c.baseURL)

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshalling submission request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating submission request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("X-Auth-Token", c.apiKey)
	}

	c.logger.Debug("sending submission to Judge0",
		zap.Int("language_id", req.LanguageID),
		zap.Int("source_code_length", len(req.SourceCode)),
	)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sending submission to Judge0: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading Judge0 response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		c.logger.Error("Judge0 returned non-success status",
			zap.Int("status_code", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return nil, fmt.Errorf("Judge0 returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result Judge0ExecutionResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshalling Judge0 response: %w", err)
	}

	c.logger.Debug("received execution result from Judge0",
		zap.String("token", result.Token),
		zap.Int("status_id", result.Status.ID),
		zap.String("status", result.Status.Description),
	)

	return &result, nil
}

// GetLanguages retrieves supported languages from Judge0
func (c *Judge0Client) GetLanguages(ctx context.Context) ([]Judge0Language, error) {
	url := fmt.Sprintf("%s/languages", c.baseURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating languages request: %w", err)
	}

	if c.apiKey != "" {
		req.Header.Set("X-Auth-Token", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching languages from Judge0: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Judge0 returned status %d", resp.StatusCode)
	}

	var languages []Judge0Language
	if err := json.NewDecoder(resp.Body).Decode(&languages); err != nil {
		return nil, fmt.Errorf("decoding languages response: %w", err)
	}

	return languages, nil
}

// ValidateLanguageID checks if a language ID is supported by Judge0
func (c *Judge0Client) ValidateLanguageID(ctx context.Context, languageID int) error {
	languages, err := c.GetLanguages(ctx)
	if err != nil {
		return fmt.Errorf("fetching supported languages: %w", err)
	}

	for _, lang := range languages {
		if lang.ID == languageID {
			return nil
		}
	}

	return fmt.Errorf("unsupported language ID: %d", languageID)
}

// GetSubmissionResult retrieves the result of a submission by token (for async polling)
func (c *Judge0Client) GetSubmissionResult(ctx context.Context, token string) (*Judge0ExecutionResult, error) {
	url := fmt.Sprintf("%s/submissions/%s?base64_encoded=false", c.baseURL, token)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating result request: %w", err)
	}

	if c.apiKey != "" {
		req.Header.Set("X-Auth-Token", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching submission result: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Judge0 returned status %d", resp.StatusCode)
	}

	var result Judge0ExecutionResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding result response: %w", err)
	}

	return &result, nil
}

// IsStatusFinal checks if the Judge0 status represents a completed execution
func IsStatusFinal(statusID int) bool {
	// Status IDs 3-14 represent final states
	// 3: Accepted, 4: Wrong Answer, 5: TLE, 6: Compilation Error, etc.
	return statusID >= 3 && statusID <= 14
}

// IsSuccessfulExecution checks if the execution completed successfully
func IsSuccessfulExecution(statusID int) bool {
	return statusID == 3 // Accepted
}
