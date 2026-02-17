package handler

import (
	"strconv"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/service"
	"github.com/gofiber/fiber/v3"
)

type AuditHandler struct {
	auditService service.AuditService
}

func NewAuditHandler(auditService service.AuditService) *AuditHandler {
	return &AuditHandler{auditService: auditService}
}

func (h *AuditHandler) ListLogs(c fiber.Ctx) error {
	skip, _ := strconv.Atoi(c.Query("skip", "0"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))

	logs, err := h.auditService.ListLogs(c.Context(), skip, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(logs)
}
