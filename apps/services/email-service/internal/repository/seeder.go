package repository

import (
	"log"

	"github.com/gradeloop/email-service/internal/domain"
	"gorm.io/gorm"
)

func SeedTemplates(db *gorm.DB) {
	templates := []domain.EmailTemplate{
		{
			Name:    "user_activation",
			Subject: "Activate Your GradeLoop Account",
			BodyHTML: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .header { background-color: #2196F3; color: white; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 10px 20px; color: white; background-color: #2196F3; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { margin-top: 20px; font-size: 0.8em; color: #777; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Welcome to GradeLoop</h2>
        </div>
        <div class="content">
            <p>Hello {{username}},</p>
            <p>Your GradeLoop account has been created successfully by an administrator.</p>
            <p>To activate your account and set your password, please click the button below:</p>
            <p style="text-align:center;">
                <a href="{{activation_link}}" class="button">Activate Account</a>
            </p>
            <p>If the button doesn't work, copy and paste the following link into your browser:</p>
            <p>{{activation_link}}</p>
            <p><strong>Note:</strong> This activation link will expire in 24 hours.</p>
            <p>If you did not expect this email, please contact support.</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 GradeLoop. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`,
			BodyText: `Hello {{username}},

Your GradeLoop account has been created successfully by an administrator.

To activate your account and set your password, please visit the following link:
{{activation_link}}

Note: This activation link will expire in 24 hours.

If you did not expect this email, please contact support.

Best regards,
The GradeLoop Team`,
			IsActive: true,
			Version:  1,
		},
		{
			Name:    "welcome_email",
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
			IsActive: true,
			Version:  1,
		},
		{
			Name:    "password_reset",
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
			IsActive: true,
			Version:  1,
		},
	}

	for _, tmpl := range templates {
		var count int64
		db.Model(&domain.EmailTemplate{}).Where("name = ?", tmpl.Name).Count(&count)
		if count == 0 {
			if err := db.Create(&tmpl).Error; err != nil {
				log.Printf("Failed to seed template %s: %v", tmpl.Name, err)
			} else {
				log.Printf("Seeded template: %s", tmpl.Name)
			}
		}
	}
}
