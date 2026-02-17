package http

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/email-service/internal/domain"
)

type Handler struct {
	service domain.EmailService
}

func NewHandler(service domain.EmailService) *Handler {
	return &Handler{service: service}
}

func (h *Handler) SendEmail(c fiber.Ctx) error {
	// Parse into a local DTO with JSON tags to avoid relying on domain struct tags
	var payload struct {
		TemplateName string                 `json:"template_name"`
		Subject      string                 `json:"subject"`
		BodyHTML     string                 `json:"body_html"`
		BodyText     string                 `json:"body_text"`
		Recipients   []string               `json:"recipients"`
		Variables    map[string]interface{} `json:"variables"`
	}

	// Try Fiber's BodyParser first; if it fails, attempt a tolerant raw unmarshal that accepts alternate keys.
	var req domain.SendEmailRequest
	if err := c.Bind().Body(&payload); err != nil {
		var raw map[string]interface{}
		if err2 := c.Bind().Body(&raw); err2 != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
		}

		// helper to read first available string key from a set
		getString := func(keys ...string) string {
			for _, k := range keys {
				if v, ok := raw[k]; ok {
					if s, ok := v.(string); ok {
						return s
					}
				}
			}
			return ""
		}

		// recipients: support "recipients" (array) or "to" (array or single)
		var recipients []string
		if r, ok := raw["recipients"]; ok {
			switch t := r.(type) {
			case []interface{}:
				for _, ri := range t {
					if s, ok := ri.(string); ok {
						recipients = append(recipients, s)
					}
				}
			case []string:
				recipients = t
			}
		} else if r, ok := raw["to"]; ok {
			switch t := r.(type) {
			case []interface{}:
				for _, ri := range t {
					if s, ok := ri.(string); ok {
						recipients = append(recipients, s)
					}
				}
			case string:
				recipients = append(recipients, t)
			}
		}

		// variables: accept embedded map or treat unknown top-level keys as variables
		var variables map[string]interface{}
		if v, ok := raw["variables"]; ok {
			if m, ok2 := v.(map[string]interface{}); ok2 {
				variables = m
			}
		} else {
			// collect top-level keys that are not standard into variables
			tmp := make(map[string]interface{})
			for k, v := range raw {
				switch k {
				case "recipients", "to", "subject", "template_name", "template", "body_html", "body_text", "bodyHtml", "bodyText":
					// skip known keys
				default:
					tmp[k] = v
				}
			}
			if len(tmp) > 0 {
				variables = tmp
			}
		}

		req = domain.SendEmailRequest{
			TemplateName: getString("template_name", "template"),
			Subject:      getString("subject"),
			BodyHTML:     getString("body_html", "bodyHtml", "html"),
			BodyText:     getString("body_text", "bodyText", "text"),
			Recipients:   recipients,
			Variables:    variables,
		}
	} else {
		// BodyParser succeeded
		req = domain.SendEmailRequest{
			TemplateName: payload.TemplateName,
			Subject:      payload.Subject,
			BodyHTML:     payload.BodyHTML,
			BodyText:     payload.BodyText,
			Recipients:   payload.Recipients,
			Variables:    payload.Variables,
		}
	}

	// Normalize variable keys used by templates:
	// ensure both "link" and "reset_link" are available (some callers send one or the other)
	if req.Variables == nil {
		req.Variables = make(map[string]interface{})
	}
	if v, ok := req.Variables["link"]; ok {
		if _, has := req.Variables["reset_link"]; !has {
			req.Variables["reset_link"] = v
		}
	} else if v, ok := req.Variables["reset_link"]; ok {
		if _, has := req.Variables["link"]; !has {
			req.Variables["link"] = v
		}
	}

	resp, err := h.service.SendEmail(c.Context(), &req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"message": "Email queued for sending",
		"id":      resp.ID,
		"status":  resp.Status,
	})
}

func (h *Handler) CreateTemplate(c fiber.Ctx) error {
	// Use a local DTO with JSON tags so incoming JSON keys (e.g. body_html) are parsed correctly
	var payload struct {
		Name     string `json:"name"`
		Subject  string `json:"subject"`
		BodyHTML string `json:"body_html"`
		BodyText string `json:"body_text"`
	}

	if err := c.Bind().Body(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req := domain.CreateTemplateRequest{
		Name:     payload.Name,
		Subject:  payload.Subject,
		BodyHTML: payload.BodyHTML,
		BodyText: payload.BodyText,
	}

	tmpl, err := h.service.CreateTemplate(c.Context(), &req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(tmpl)
}

func (h *Handler) GetTemplate(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid UUID"})
	}

	tmpl, err := h.service.GetTemplate(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}

	return c.Status(fiber.StatusOK).JSON(tmpl)
}

func (h *Handler) GetStatus(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid UUID"})
	}

	msg, err := h.service.GetEmailStatus(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Message not found"})
	}

	return c.Status(fiber.StatusOK).JSON(msg)
}
