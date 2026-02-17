package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"time"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/config"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/database"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/model"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// helper: generate cryptographically secure random token (hex)
func generateRandomToken(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// helper: bcrypt hash of token (used for storage). We use bcrypt so stored hashes must be
// compared via bcrypt.CompareHashAndPassword when verifying incoming tokens.
func hashToken(t string) string {
	b, err := bcrypt.GenerateFromPassword([]byte(t), 12)
	if err != nil {
		// on error return empty string (caller should handle failure when persisting)
		return ""
	}
	return string(b)
}

// createAccessToken issues a JWT access token valid for provided duration (minutes).
// Standardized on HS256 using SECRET.
func createAccessToken(username string, userID uint, minutes int) (string, error) {
	claims := jwt.MapClaims{}
	claims["username"] = username
	claims["user_id"] = userID
	claims["exp"] = time.Now().Add(time.Duration(minutes) * time.Minute).Unix()

	// Use HS256 with SECRET
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := config.Config("SECRET")
	return token.SignedString([]byte(secret))
}

// issueRefreshToken generates, hashes, and persists a new refresh token for a user.
func issueRefreshToken(db *gorm.DB, userID uint, ip, userAgent string) (string, error) {
	newToken, err := generateRandomToken(32)
	if err != nil {
		return "", err
	}

	hash := hashToken(newToken)
	if hash == "" {
		return "", errors.New("failed to hash refresh token")
	}

	rtTTLdays := 30
	expiresAt := time.Now().Add(time.Duration(rtTTLdays) * 24 * time.Hour)

	rt := model.RefreshToken{
		TokenHash: hash,
		UserID:    userID,
		ExpiresAt: expiresAt,
		IP:        ip,
		UserAgent: userAgent,
	}

	if err := db.Create(&rt).Error; err != nil {
		return "", err
	}

	return newToken, nil
}

// findRefreshToken locates an active refresh token in the database by comparing
// the incoming raw token against stored hashes.
func findRefreshToken(db *gorm.DB, token string) (*model.RefreshToken, error) {
	var candidates []model.RefreshToken
	// Only fetch unrevoked and non-expired tokens
	if err := db.Where("revoked = ? AND expires_at > ?", false, time.Now()).Find(&candidates).Error; err != nil {
		return nil, err
	}

	for _, rt := range candidates {
		if bcrypt.CompareHashAndPassword([]byte(rt.TokenHash), []byte(token)) == nil {
			return &rt, nil
		}
	}

	return nil, nil // Not found
}

// Refresh handler - rotate refresh token and return new access + refresh tokens.
// Accepts refresh token from cookie "refresh_token" or JSON { "refresh_token": "<token>" }.
func Refresh(c fiber.Ctx) error {
	type RefreshInput struct {
		RefreshToken string `json:"refresh_token"`
	}

	var in RefreshInput
	rtFromCookie := c.Cookies("refresh_token", "")

	if rtFromCookie == "" {
		if err := c.Bind().Body(&in); err != nil {
			// allow empty body - will be handled below
		}
	} else {
		in.RefreshToken = rtFromCookie
	}

	if in.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "refresh token required", "data": nil})
	}

	db := database.DB

	stored, err := findRefreshToken(db, in.RefreshToken)
	if err != nil {
		log.Printf("Refresh: error searching for token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "internal error", "data": nil})
	}

	if stored == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"status": "error", "message": "invalid refresh token", "data": nil})
	}

	// Load user
	var user model.User
	if err := db.First(&user, stored.UserID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "internal error", "data": nil})
	}

	// Create new refresh token using transaction for rotation
	tx := db.Begin()
	if tx.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "internal error", "data": nil})
	}

	newToken, err := issueRefreshToken(tx, user.ID, c.IP(), c.Get("User-Agent"))
	if err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't issue new token", "data": nil})
	}

	// Revoke old token and link to new one
	newHash := hashToken(newToken) // Redundant hash for linking, but safe
	if err := tx.Model(stored).Updates(map[string]interface{}{
		"revoked":                true,
		"revoked_at":             time.Now(),
		"replaced_by_token_hash": newHash,
	}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't revoke old token", "data": nil})
	}

	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "transaction failed", "data": nil})
	}

	// create access token
	accessTTLMin := 15
	at, err := createAccessToken(user.Username, user.ID, accessTTLMin)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't create access token", "data": nil})
	}

	// Return both tokens.
	return c.JSON(fiber.Map{"status": "success", "message": "tokens refreshed", "data": fiber.Map{
		"access_token":  at,
		"refresh_token": newToken,
	}})
}

// Logout handler - revoke a refresh token (or all user's tokens if 'all=true' and request JWT authenticated).
// If "refresh_token" provided in cookie or body, revoke that one. If Protected middleware used and query param all=true, revoke all for user.
func Logout(c fiber.Ctx) error {
	type LogoutInput struct {
		RefreshToken string `json:"refresh_token"`
		All          bool   `json:"all"`
	}
	var in LogoutInput
	_ = c.Bind().Body(&in)

	// allow cookie
	if in.RefreshToken == "" {
		in.RefreshToken = c.Cookies("refresh_token", "")
	}

	db := database.DB

	// If JWT protected and user wants to revoke all, try to read from locals
	if in.All {
		// Attempt to get user id from token if present (middleware must set "user")
		if tLocal := c.Locals("user"); tLocal != nil {
			if tok, ok := tLocal.(*jwt.Token); ok {
				claims := tok.Claims.(jwt.MapClaims)
				if uidFloat, ok := claims["user_id"].(float64); ok {
					uid := uint(uidFloat)
					// revoke all active tokens for this user
					if err := db.Model(&model.RefreshToken{}).Where("user_id = ? AND revoked = ?", uid, false).Updates(map[string]interface{}{
						"revoked":    true,
						"revoked_at": time.Now(),
					}).Error; err != nil {
						return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't revoke tokens", "data": nil})
					}
					return c.JSON(fiber.Map{"status": "success", "message": "all refresh tokens revoked", "data": nil})
				}
			}
		}
		// If we didn't get user id, return bad request
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "can't revoke all without valid jwt", "data": nil})
	}

	rt, err := findRefreshToken(db, in.RefreshToken)
	if err != nil {
		return c.JSON(fiber.Map{"status": "success", "message": "logged out", "data": nil})
	}
	if rt == nil {
		// Even if not found, return success to avoid token probing
		return c.JSON(fiber.Map{"status": "success", "message": "logged out", "data": nil})
	}

	if rt.Revoked {
		return c.JSON(fiber.Map{"status": "success", "message": "already logged out", "data": nil})
	}

	if err := db.Model(&rt).Updates(map[string]interface{}{
		"revoked":    true,
		"revoked_at": time.Now(),
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't revoke token", "data": nil})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "logged out", "data": nil})
}

// ForgotPassword - generate a one-time reset token and store hashed copy (expires in 15 minutes).
// Input: { "email": "user@example.com" }
// NOTE: In production, you should send the token via email. For dev/testing this returns the token in response.
func ForgotPassword(c fiber.Ctx) error {
	type Input struct {
		Email string `json:"email"`
	}
	var in Input
	if err := c.Bind().Body(&in); err != nil || in.Email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "email required", "data": nil})
	}

	db := database.DB
	var user model.User
	if err := db.Where(&model.User{Email: in.Email}).First(&user).Error; err != nil {
		// Do not reveal whether email exists; respond success.
		return c.JSON(fiber.Map{"status": "success", "message": "if the email exists, a reset link has been sent", "data": nil})
	}

	// create reset token
	rawToken, err := generateRandomToken(24)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't generate token", "data": nil})
	}
	hashedBytes, herr := bcrypt.GenerateFromPassword([]byte(rawToken), 12)
	if herr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't hash reset token", "data": nil})
	}
	hashed := string(hashedBytes)
	prTTLMinutes := 15
	pr := model.PasswordReset{
		TokenHash:    hashed,
		UserID:       user.ID,
		ExpiresAt:    time.Now().Add(time.Duration(prTTLMinutes) * time.Minute),
		RequestIP:    c.IP(),
		RequestAgent: c.Get("User-Agent"),
	}

	if err := db.Create(&pr).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't create reset record", "data": nil})
	}

	// TODO: send email with rawToken to user.Email via email provider.
	// For dev, return token in response (remove in prod).
	return c.JSON(fiber.Map{"status": "success", "message": "password reset created", "data": fiber.Map{
		"reset_token": rawToken,
	}})
}

// ResetPassword - accept reset token and new password and rotate user's password.
// Input: { "token": "...", "password": "newpass" }
func ResetPassword(c fiber.Ctx) error {
	type Input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	var in Input
	if err := c.Bind().Body(&in); err != nil || in.Token == "" || in.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "token and password required", "data": nil})
	}
	if len(in.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "password too short", "data": nil})
	}
	if len(in.Password) > 72 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "password too long", "data": nil})
	}

	db := database.DB
	var candidates []model.PasswordReset
	if err := db.Where("used = ? AND expires_at > ?", false, time.Now()).Find(&candidates).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "invalid or expired token", "data": nil})
	}
	var pr model.PasswordReset
	found := false
	for _, p := range candidates {
		if bcrypt.CompareHashAndPassword([]byte(p.TokenHash), []byte(in.Token)) == nil {
			pr = p
			found = true
			break
		}
	}
	if !found {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "invalid or expired token", "data": nil})
	}

	if pr.Used || pr.IsExpired() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "token expired or already used", "data": nil})
	}

	var user model.User
	if err := db.First(&user, pr.UserID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "user not found", "data": nil})
	}

	// Hash new password
	passHash, err := hashPassword(in.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't hash password", "data": nil})
	}

	// Update password, mark reset used, revoke refresh tokens in a transaction
	tx := db.Begin()
	if tx.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "internal error", "data": nil})
	}

	if err := tx.Model(&user).Update("password", passHash).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't update password", "data": nil})
	}

	// mark password reset used
	now := time.Now()
	if err := tx.Model(&pr).Updates(map[string]interface{}{
		"used":    true,
		"used_at": now,
	}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't mark reset used", "data": nil})
	}

	// revoke all refresh tokens for user
	if err := tx.Model(&model.RefreshToken{}).Where("user_id = ? AND revoked = ?", user.ID, false).Updates(map[string]interface{}{
		"revoked":    true,
		"revoked_at": now,
	}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "couldn't revoke sessions", "data": nil})
	}

	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "transaction failed", "data": nil})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "password reset successful", "data": nil})
}

// Use package-level helpers (from other files in this package).
// The iam-service already defines `hashPassword` and `CheckPasswordHash` in other files
// (see `user.go` and `auth.go`). Rely on those implementations rather than providing
// duplicate fallback implementations here. This avoids duplicate symbol definitions
// at link time and keeps the token handlers focused on token logic.
