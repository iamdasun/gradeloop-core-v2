package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/gradeloop/email-service/internal/domain"
	infra "github.com/gradeloop/email-service/internal/infrastructure"
	"github.com/gradeloop/email-service/internal/infrastructure/rabbitmq"
	amqp "github.com/rabbitmq/amqp091-go"
)

type Consumer struct {
	consumer *rabbitmq.Consumer
	repo     domain.EmailRepository
	mailer   *infra.Mailer
	producer *rabbitmq.Producer // For retry/dead-letter
}

func NewConsumer(consumer *rabbitmq.Consumer, repo domain.EmailRepository, mailer *infra.Mailer, producer *rabbitmq.Producer) *Consumer {
	return &Consumer{
		consumer: consumer,
		repo:     repo,
		mailer:   mailer,
		producer: producer,
	}
}

func (c *Consumer) Start(ctx context.Context) {
	log.Println("Starting RabbitMQ Consumer...")
	msgs, err := c.consumer.Consume("email.send") // Queue name
	if err != nil {
		log.Fatalf("Failed to start consumer: %v", err)
	}

	forever := make(chan bool)

	go func() {
		for d := range msgs {
			log.Printf("Received a message: %s", d.Body)
			if err := c.processMessage(ctx, d); err != nil {
				log.Printf("Error processing message: %v", err)
				d.Nack(false, true) // Requeue
			} else {
				d.Ack(false)
			}
		}
	}()

	log.Printf(" [*] Waiting for messages. To exit press CTRL+C")
	<-forever
}

func (c *Consumer) processMessage(ctx context.Context, m amqp.Delivery) error {
	var event struct {
		MessageID    uuid.UUID              `json:"message_id"`
		TemplateID   *uuid.UUID             `json:"template_id"`
		TemplateName string                 `json:"template_name"`
		Recipients   []string               `json:"recipients"`
		Subject      string                 `json:"subject"`
		BodyHTML     string                 `json:"body_html,omitempty"`
		BodyText     string                 `json:"body_text,omitempty"`
		Variables    map[string]interface{} `json:"variables"`
	}

	if err := json.Unmarshal(m.Body, &event); err != nil {
		return err
	}

	// 1. Fetch Message Status (idempotency check?)
	_, err := c.repo.GetMessage(ctx, event.MessageID)
	if err != nil {
		return err
	}

	// 2. Resolve Body using in-memory templates (no DB dependency)
	var bodyHTML, bodyText string

	// In-memory template definitions
	templates := map[string]struct {
		Subject  string
		BodyHTML string
		BodyText string
	}{
		"welcome_email": {
			Subject: "Welcome to GradeLoop - Your Account Details",
			BodyHTML: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .header { background-color: #4CAF50; color: white; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; }
        .footer { margin-top: 20px; font-size: 0.8em; color: #777; text-align: center; }
		.password-box { background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 1.2em; text-align: center; margin: 20px 0; letter-spacing: 2px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Welcome to GradeLoop</h2>
        </div>
        <div class="content">
            <p>Hello {{name}},</p>
            <p>Your GradeLoop account has been created successfully.</p>
            <p>Here is your temporary password:</p>
            <div class="password-box">{{password}}</div>
            <p>Please log in using this password. You will be required to change it immediately upon your first login.</p>
            <p>If you have any questions, please contact support.</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 GradeLoop. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`,
			BodyText: `Hello {{name}},

Your GradeLoop account has been created successfully.

Here is your temporary password:
{{password}}

Please log in using this password. You will be required to change it immediately upon your first login.

Best regards,
The GradeLoop Team`,
		},
		"password_reset": {
			Subject: "Action Required: Reset Your GradeLoop Password",
			BodyHTML: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .header { background-color: #f44336; color: white; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 10px 20px; color: white; background-color: #f44336; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { margin-top: 20px; font-size: 0.8em; color: #777; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Password Reset Request</h2>
        </div>
        <div class="content">
            <p>Hello {{name}},</p>
            <p>We received a request to reset your GradeLoop password. To reset your password, click the button below:</p>
            <p style="text-align:center;">
                <a href="{{reset_link}}" class="button">Reset Password</a>
            </p>
            <p>If you did not request a password reset, please ignore this email or contact support.</p>
            <p>Alternatively, you can copy and paste the following link into your browser:</p>
            <p>{{reset_link}}</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 GradeLoop. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`,
			BodyText: `Hello {{name}},

We received a request to reset your GradeLoop password.

Please use the following link to reset your password:
{{reset_link}}

If you did not request a password reset, please ignore this email or contact support.

Best regards,
The GradeLoop Team`,
		},
	}

	// Prefer template_name (from publisher). If provided, use our in-memory templates.
	if event.TemplateName != "" {
		if tmpl, ok := templates[event.TemplateName]; ok {
			bodyHTML = tmpl.BodyHTML
			bodyText = tmpl.BodyText
			// Interpolate variables
			for k, v := range event.Variables {
				val := fmt.Sprintf("%v", v)
				bodyHTML = strings.ReplaceAll(bodyHTML, "{{"+k+"}}", val)
				bodyText = strings.ReplaceAll(bodyText, "{{"+k+"}}", val)
			}
		} else {
			log.Printf("Template %s not found in in-memory templates", event.TemplateName)
			return fmt.Errorf("template %s not found", event.TemplateName)
		}
	} else if event.TemplateID != nil {
		// Backward-compatibility: if a template_id was provided, still attempt to fetch from DB
		tmpl, err := c.repo.GetTemplate(ctx, *event.TemplateID)
		if err != nil {
			log.Printf("Failed to get template by ID: %v", err)
			return err
		}
		bodyHTML = tmpl.BodyHTML
		bodyText = tmpl.BodyText
		for k, v := range event.Variables {
			val := fmt.Sprintf("%v", v)
			bodyHTML = strings.ReplaceAll(bodyHTML, "{{"+k+"}}", val)
			bodyText = strings.ReplaceAll(bodyText, "{{"+k+"}}", val)
		}
	} else {
		// Use provided body content
		bodyHTML = event.BodyHTML
		bodyText = event.BodyText
		if bodyHTML == "" && bodyText == "" {
			bodyHTML = "<h1>No Content</h1>"
			bodyText = "No Content"
		}
	}

	// 3. Send Email
	if err := c.mailer.Send(event.Recipients, event.Subject, bodyHTML, bodyText); err != nil {
		log.Printf("Failed to send email: %v", err)
		c.repo.UpdateMessageStatus(ctx, event.MessageID, domain.StatusFailed)
		return err // Force retry
	}

	// 4. Update Status
	return c.repo.UpdateMessageStatus(ctx, event.MessageID, domain.StatusSent)
}
