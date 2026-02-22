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
	AuditActionFacultyCreated     AuditAction = "FACULTY_CREATED"
	AuditActionFacultyUpdated     AuditAction = "FACULTY_UPDATED"
	AuditActionFacultyDeactivated AuditAction = "FACULTY_DEACTIVATED"
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
