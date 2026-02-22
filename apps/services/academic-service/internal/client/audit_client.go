package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// AuditAction represents the type of action being audited
type AuditAction string

const (
	AuditActionFacultyCreated        AuditAction = "FACULTY_CREATED"
	AuditActionFacultyUpdated        AuditAction = "FACULTY_UPDATED"
	AuditActionFacultyDeactivated    AuditAction = "FACULTY_DEACTIVATED"
	AuditActionDepartmentCreated     AuditAction = "DEPARTMENT_CREATED"
	AuditActionDepartmentUpdated     AuditAction = "DEPARTMENT_UPDATED"
	AuditActionDepartmentDeactivated AuditAction = "DEPARTMENT_DEACTIVATED"

	// Degree actions
	AuditActionDegreeCreated     AuditAction = "DEGREE_CREATED"
	AuditActionDegreeUpdated     AuditAction = "DEGREE_UPDATED"
	AuditActionDegreeDeactivated AuditAction = "DEGREE_DEACTIVATED"

	// Specialization actions
	AuditActionSpecializationCreated     AuditAction = "SPECIALIZATION_CREATED"
	AuditActionSpecializationUpdated     AuditAction = "SPECIALIZATION_UPDATED"
	AuditActionSpecializationDeactivated AuditAction = "SPECIALIZATION_DEACTIVATED"

	// Batch actions
	AuditActionBatchCreated     AuditAction = "BATCH_CREATED"
	AuditActionBatchUpdated     AuditAction = "BATCH_UPDATED"
	AuditActionBatchDeactivated AuditAction = "BATCH_DEACTIVATED"

	// Course actions
	AuditActionCourseCreated             AuditAction = "COURSE_CREATED"
	AuditActionCourseUpdated             AuditAction = "COURSE_UPDATED"
	AuditActionCourseDeactivated         AuditAction = "COURSE_DEACTIVATED"
	AuditActionCoursePrerequisiteAdded   AuditAction = "COURSE_PREREQUISITE_ADDED"
	AuditActionCoursePrerequisiteRemoved AuditAction = "COURSE_PREREQUISITE_REMOVED"

	// Semester actions
	AuditActionSemesterCreated     AuditAction = "SEMESTER_CREATED"
	AuditActionSemesterUpdated     AuditAction = "SEMESTER_UPDATED"
	AuditActionSemesterDeactivated AuditAction = "SEMESTER_DEACTIVATED"

	// Enrollment management actions
	AuditActionBatchMemberAdded         AuditAction = "BATCH_MEMBER_ADDED"
	AuditActionBatchMemberRemoved       AuditAction = "BATCH_MEMBER_REMOVED"
	AuditActionCourseInstanceCreated    AuditAction = "COURSE_INSTANCE_CREATED"
	AuditActionCourseInstanceUpdated    AuditAction = "COURSE_INSTANCE_UPDATED"
	AuditActionCourseInstructorAssigned AuditAction = "COURSE_INSTRUCTOR_ASSIGNED"
	AuditActionCourseInstructorRemoved  AuditAction = "COURSE_INSTRUCTOR_REMOVED"
	AuditActionStudentEnrolled          AuditAction = "STUDENT_ENROLLED"
	AuditActionEnrollmentUpdated        AuditAction = "ENROLLMENT_UPDATED"
	AuditActionEnrollmentRemoved        AuditAction = "ENROLLMENT_REMOVED"
)

// AuditLogRequest represents the request body for audit logging
type AuditLogRequest struct {
	Action     string                 `json:"action"`
	Entity     string                 `json:"entity"`
	EntityID   string                 `json:"entity_id"`
	UserID     uint                   `json:"user_id"`
	Email      string                 `json:"email"`
	Changes    map[string]interface{} `json:"changes,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
	IPAddress  string                 `json:"ip_address,omitempty"`
	UserAgent  string                 `json:"user_agent,omitempty"`
	Service    string                 `json:"service"`
	OccurredAt time.Time              `json:"occurred_at"`
}

// AuditClient handles audit logging
type AuditClient struct {
	iamServiceURL string
	httpClient    *http.Client
	logger        *zap.Logger
}

// NewAuditClient creates a new audit client
func NewAuditClient(iamServiceURL string, logger *zap.Logger) *AuditClient {
	return &AuditClient{
		iamServiceURL: iamServiceURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		logger: logger,
	}
}

// LogFacultyAction logs a faculty-related action
func (c *AuditClient) LogFacultyAction(
	action AuditAction,
	facultyID uuid.UUID,
	userID uint,
	email string,
	changes map[string]interface{},
	metadata map[string]interface{},
	ipAddress string,
	userAgent string,
) error {
	auditLog := AuditLogRequest{
		Action:     string(action),
		Entity:     "faculty",
		EntityID:   facultyID.String(),
		UserID:     userID,
		Email:      email,
		Changes:    changes,
		Metadata:   metadata,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		Service:    "academic-service",
		OccurredAt: time.Now(),
	}

	return c.sendAuditLog(auditLog)
}

// LogDepartmentAction logs a department-related action
func (c *AuditClient) LogDepartmentAction(
	action AuditAction,
	departmentID uuid.UUID,
	userID uint,
	email string,
	changes map[string]interface{},
	metadata map[string]interface{},
	ipAddress string,
	userAgent string,
) error {
	auditLog := AuditLogRequest{
		Action:     string(action),
		Entity:     "department",
		EntityID:   departmentID.String(),
		UserID:     userID,
		Email:      email,
		Changes:    changes,
		Metadata:   metadata,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		Service:    "academic-service",
		OccurredAt: time.Now(),
	}

	return c.sendAuditLog(auditLog)
}

// LogDegreeAction logs a degree-related action
func (c *AuditClient) LogDegreeAction(
	action AuditAction,
	degreeID uuid.UUID,
	userID uint,
	email string,
	changes map[string]interface{},
	metadata map[string]interface{},
	ipAddress string,
	userAgent string,
) error {
	auditLog := AuditLogRequest{
		Action:     string(action),
		Entity:     "degree",
		EntityID:   degreeID.String(),
		UserID:     userID,
		Email:      email,
		Changes:    changes,
		Metadata:   metadata,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		Service:    "academic-service",
		OccurredAt: time.Now(),
	}

	return c.sendAuditLog(auditLog)
}

// LogSpecializationAction logs a specialization-related action
func (c *AuditClient) LogSpecializationAction(
	action AuditAction,
	specializationID uuid.UUID,
	userID uint,
	email string,
	changes map[string]interface{},
	metadata map[string]interface{},
	ipAddress string,
	userAgent string,
) error {
	auditLog := AuditLogRequest{
		Action:     string(action),
		Entity:     "specialization",
		EntityID:   specializationID.String(),
		UserID:     userID,
		Email:      email,
		Changes:    changes,
		Metadata:   metadata,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		Service:    "academic-service",
		OccurredAt: time.Now(),
	}

	return c.sendAuditLog(auditLog)
}

// sendAuditLog sends the audit log to the IAM service
func (c *AuditClient) sendAuditLog(auditLog AuditLogRequest) error {
	url := fmt.Sprintf("%s/api/v1/audit-logs", c.iamServiceURL)

	jsonData, err := json.Marshal(auditLog)
	if err != nil {
		c.logger.Error("failed to marshal audit log", zap.Error(err))
		return err
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(jsonData))
	if err != nil {
		c.logger.Error("failed to create audit log request", zap.Error(err))
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Error("failed to send audit log", zap.Error(err))
		// Don't fail the main operation if audit logging fails
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		c.logger.Warn("audit log request returned non-success status",
			zap.Int("status", resp.StatusCode),
			zap.String("action", auditLog.Action),
		)
	}

	return nil
}

// LogAction is a generic method for logging any action
func (c *AuditClient) LogAction(
	action string,
	entity string,
	entityID string,
	userID uint,
	email string,
	changes map[string]interface{},
	metadata map[string]interface{},
	ipAddress string,
	userAgent string,
) error {
	auditLog := AuditLogRequest{
		Action:     action,
		Entity:     entity,
		EntityID:   entityID,
		UserID:     userID,
		Email:      email,
		Changes:    changes,
		Metadata:   metadata,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		Service:    "academic-service",
		OccurredAt: time.Now(),
	}

	return c.sendAuditLog(auditLog)
}
