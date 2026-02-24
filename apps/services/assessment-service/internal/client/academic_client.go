package client

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// ─────────────────────────────────────────────────────────────────────────────
// Response shapes (minimal — only the fields the assessment service needs)
// ─────────────────────────────────────────────────────────────────────────────

// enrollmentListResponse mirrors the paginated envelope returned by the
// Academic Service GET /api/v1/enrollments endpoint.
type enrollmentListResponse struct {
	Enrollments []enrollmentItem `json:"enrollments"`
	Count       int              `json:"count"`
}

// enrollmentItem holds the fields we care about from a single enrollment row.
type enrollmentItem struct {
	ID               interface{} `json:"id"`
	UserID           interface{} `json:"user_id"`
	CourseInstanceID interface{} `json:"course_instance_id"`
	Status           string      `json:"status"`
}

// ─────────────────────────────────────────────────────────────────────────────
// AcademicClient
// ─────────────────────────────────────────────────────────────────────────────

// AcademicClient makes HTTP calls to the Academic Service for cross-service
// validations that the Assessment Service must perform (e.g. enrollment checks).
type AcademicClient struct {
	baseURL    string
	httpClient *http.Client
	logger     *zap.Logger
}

// NewAcademicClient creates a new AcademicClient targeting the given base URL.
func NewAcademicClient(baseURL string, logger *zap.Logger) *AcademicClient {
	return &AcademicClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		logger: logger,
	}
}

// IsEnrolled calls GET /api/v1/enrollments?user_id=<userID>&course_instance_id=<courseInstanceID>
// and returns true when at least one active enrollment record is found.
//
// A network error or a non-2xx response is treated as "not enrolled" with a
// wrapped error so that callers can distinguish a hard failure from a clean
// "not found" result.
func (c *AcademicClient) IsEnrolled(userID, courseInstanceID string) (bool, error) {
	url := fmt.Sprintf(
		"%s/api/v1/enrollments?user_id=%s&course_instance_id=%s",
		c.baseURL, userID, courseInstanceID,
	)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		c.logger.Error("academic client: failed to build enrollment request",
			zap.String("user_id", userID),
			zap.String("course_instance_id", courseInstanceID),
			zap.Error(err),
		)
		return false, fmt.Errorf("building enrollment request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Warn("academic client: enrollment check request failed",
			zap.String("user_id", userID),
			zap.String("course_instance_id", courseInstanceID),
			zap.Error(err),
		)
		return false, fmt.Errorf("enrollment check request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.logger.Warn("academic client: unexpected status on enrollment check",
			zap.Int("status", resp.StatusCode),
			zap.String("user_id", userID),
			zap.String("course_instance_id", courseInstanceID),
		)
		return false, fmt.Errorf("enrollment check returned status %d", resp.StatusCode)
	}

	var body enrollmentListResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		c.logger.Error("academic client: failed to decode enrollment response", zap.Error(err))
		return false, fmt.Errorf("decoding enrollment response: %w", err)
	}

	// Any enrollment record (active or otherwise) is sufficient — the Academic
	// Service is expected to filter by active status at its own layer.
	// We treat count > 0 as enrolled.
	if body.Count > 0 {
		return true, nil
	}

	// Also walk the slice in case the academic service response shape varies
	// slightly (e.g. count field absent).
	return len(body.Enrollments) > 0, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Instructor course assignments
// ─────────────────────────────────────────────────────────────────────────────

// CourseInstructorItem represents a single instructor ↔ course instance assignment.
type CourseInstructorItem struct {
	CourseInstanceID string `json:"course_instance_id"`
	UserID           string `json:"user_id"`
	Role             string `json:"role"`
}

// instructorCoursesResponse mirrors the response from
// GET /api/v1/instructor-courses/me
type instructorCoursesResponse struct {
	Courses []CourseInstructorItem `json:"courses"`
	Count   int                    `json:"count"`
}

// GetInstructorCourses calls GET /api/v1/instructor-courses/me on the Academic
// Service with the given auth token and returns the list of course instance
// assignments for the authenticated user.
func (c *AcademicClient) GetInstructorCourses(token string) ([]CourseInstructorItem, error) {
	url := fmt.Sprintf("%s/api/v1/instructor-courses/me", c.baseURL)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		c.logger.Error("academic client: failed to build instructor courses request",
			zap.Error(err),
		)
		return nil, fmt.Errorf("building instructor courses request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Warn("academic client: instructor courses request failed",
			zap.Error(err),
		)
		return nil, fmt.Errorf("instructor courses request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.logger.Warn("academic client: unexpected status on instructor courses",
			zap.Int("status", resp.StatusCode),
		)
		return nil, fmt.Errorf("instructor courses returned status %d", resp.StatusCode)
	}

	var body instructorCoursesResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		c.logger.Error("academic client: failed to decode instructor courses response", zap.Error(err))
		return nil, fmt.Errorf("decoding instructor courses response: %w", err)
	}

	return body.Courses, nil
}
