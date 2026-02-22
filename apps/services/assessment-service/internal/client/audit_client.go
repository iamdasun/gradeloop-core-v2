package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// AuditAction represents the type of action being audited.
type AuditAction string

const (
	// Assignment audit actions
	AuditActionAssignmentCreated     AuditAction = "ASSIGNMENT_CREATED"
	AuditActionAssignmentUpdated     AuditAction = "ASSIGNMENT_UPDATED"
	AuditActionAssignmentDeactivated AuditAction = "ASSIGNMENT_DEACTIVATED"
)

// AuditLogRequest is the payload sent to the IAM Service audit-log endpoint.
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

// AuditClient sends audit log entries to the IAM Service.
type AuditClient struct {
	iamServiceURL string
	httpClient    *http.Client
	logger        *zap.Logger
}

// NewAuditClient creates a new AuditClient.
func NewAuditClient(iamServiceURL string, logger *zap.Logger) *AuditClient {
	return &AuditClient{
		iamServiceURL: iamServiceURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		logger: logger,
	}
}

// LogAction is a generic audit log emitter.  Audit failures are logged as
// warnings but never surface to the caller — the main operation must succeed
// independently of audit logging.
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
	entry := AuditLogRequest{
		Action:     action,
		Entity:     entity,
		EntityID:   entityID,
		UserID:     userID,
		Email:      email,
		Changes:    changes,
		Metadata:   metadata,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		Service:    "assessment-service",
		OccurredAt: time.Now(),
	}
	return c.send(entry)
}

// send marshals the entry and POSTs it to the IAM Service audit endpoint.
// Network or non-2xx responses are logged but swallowed.
func (c *AuditClient) send(entry AuditLogRequest) error {
	url := fmt.Sprintf("%s/api/v1/audit-logs", c.iamServiceURL)

	payload, err := json.Marshal(entry)
	if err != nil {
		c.logger.Error("audit: failed to marshal log entry", zap.Error(err))
		return err
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(payload))
	if err != nil {
		c.logger.Error("audit: failed to build request", zap.Error(err))
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Intentionally swallowed — audit logging must not block the main flow.
		c.logger.Warn("audit: failed to send log entry", zap.Error(err))
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		c.logger.Warn("audit: unexpected response status",
			zap.Int("status", resp.StatusCode),
			zap.String("action", entry.Action),
		)
	}

	return nil
}
