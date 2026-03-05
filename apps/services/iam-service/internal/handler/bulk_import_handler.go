package handler

import (
	"encoding/json"
	"fmt"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/service"
)

type BulkImportHandler struct {
	bulkImportService service.BulkImportService
}

func NewBulkImportHandler(bulkImportService service.BulkImportService) *BulkImportHandler {
	return &BulkImportHandler{
		bulkImportService: bulkImportService,
	}
}

func (h *BulkImportHandler) DownloadTemplate(c fiber.Ctx) error {
	format := c.Query("format", "xlsx")
	content, contentType, err := h.bulkImportService.GenerateTemplate(format)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("failed to generate template: %v", err))
	}

	filename := "user_import_template.xlsx"
	if format == "csv" {
		filename = "user_import_template.csv"
	}

	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	return c.Send(content)
}

func (h *BulkImportHandler) PreviewImport(c fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "no file provided")
	}

	f, err := file.Open()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to open file")
	}
	defer f.Close()

	response, err := h.bulkImportService.PreviewImport(c.RequestCtx(), f, file.Filename)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	return c.JSON(response)
}

func (h *BulkImportHandler) ExecuteImport(c fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "no file provided")
	}

	mappingJson := c.FormValue("column_mapping")
	if mappingJson == "" {
		return fiber.NewError(fiber.StatusBadRequest, "column_mapping is required")
	}

	var mapping map[string]string
	if err := json.Unmarshal([]byte(mappingJson), &mapping); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid column_mapping JSON")
	}

	// Get actor user type from context (set by AuthMiddleware)
	actorUserType, ok := c.Locals("user_type").(string)
	if !ok || actorUserType == "" {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	f, err := file.Open()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to open file")
	}
	defer f.Close()

	response, err := h.bulkImportService.ExecuteImport(c.RequestCtx(), f, file.Filename, mapping, actorUserType)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(response)
}
