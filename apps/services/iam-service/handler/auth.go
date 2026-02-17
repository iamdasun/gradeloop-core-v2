package handler

import (
	"errors"
	"net/mail"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/database"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/model"

	"gorm.io/gorm"

	"github.com/gofiber/fiber/v3"
	"golang.org/x/crypto/bcrypt"
)

// CheckPasswordHash compare password with hash
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func getUserByEmail(e string) (*model.User, error) {
	db := database.DB
	var user model.User
	if err := db.Where(&model.User{Email: e}).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func getUserByUsername(u string) (*model.User, error) {
	db := database.DB
	var user model.User
	if err := db.Where(&model.User{Username: u}).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func valid(email string) bool {
	_, err := mail.ParseAddress(email)
	return err == nil
}

// Login authenticate with email and password (email + password only)
func Login(c fiber.Ctx) error {
	type LoginInput struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	input := new(LoginInput)

	if err := c.Bind().Body(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Error on login request", "errors": err.Error()})
	}

	email := input.Email
	pass := input.Password

	if email == "" || pass == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Email and password are required", "data": nil})
	}

	// Try to find user by email
	userModel, err := getUserByEmail(email)

	// constant dummy hash to mitigate timing attacks when user not found
	const dummyHash = "$2a$10$7zFqzDbD3RrlkMTczbXG9OWZ0FLOXjIxXzSZ.QZxkVXjXcx7QZQiC" // => Hashed " "

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Internal Server Error", "data": err})
	}

	if userModel == nil {
		// Always perform a hash check, even if the user doesn't exist, to prevent timing attacks
		CheckPasswordHash(pass, dummyHash)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"status": "error", "message": "Invalid email or password", "data": nil})
	}

	// Validate password
	if !CheckPasswordHash(pass, userModel.Password) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"status": "error", "message": "Invalid email or password", "data": nil})
	}

	// Create JWT access token
	at, err := createAccessToken(userModel.Username, userModel.ID, 72*60) // 72 hours
	if err != nil {
		return c.SendStatus(fiber.StatusInternalServerError)
	}

	// Issue and persist Refresh Token
	rt, err := issueRefreshToken(database.DB, userModel.ID, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Could not issue refresh token", "data": nil})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Success login", "data": fiber.Map{
		"access_token":  at,
		"refresh_token": rt,
	}})
}
