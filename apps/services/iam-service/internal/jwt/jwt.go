package jwt

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token has expired")
)

type Claims struct {
	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	RoleName    string    `json:"role_name"`
	FullName    string    `json:"full_name"`
	Permissions []string  `json:"permissions"`
	jwt.RegisteredClaims
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

type JWT struct {
	secretKey          []byte
	accessTokenExpiry  time.Duration
	refreshTokenExpiry time.Duration
}

func NewJWT(secretKey string, accessTokenExpiryMinutes, refreshTokenExpiryDays int64) *JWT {
	return &JWT{
		secretKey:          []byte(secretKey),
		accessTokenExpiry:  time.Duration(accessTokenExpiryMinutes) * time.Minute,
		refreshTokenExpiry: time.Duration(refreshTokenExpiryDays) * 24 * time.Hour,
	}
}

func GenerateAccessToken(userID uuid.UUID, email, fullName, roleName string, permissions []string, secretKey []byte, expiry time.Duration) (string, time.Time, error) {
	if len(secretKey) == 0 {
		return "", time.Time{}, errors.New("secret key cannot be empty")
	}

	expiresAt := time.Now().Add(expiry)

	claims := Claims{
		UserID:      userID,
		Email:       email,
		FullName:    fullName,
		RoleName:    roleName,
		Permissions: permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "iam-service",
			Subject:   userID.String(),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	signedToken, err := token.SignedString(secretKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("signing token: %w", err)
	}

	return signedToken, expiresAt, nil
}

func GenerateRefreshToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generating random bytes: %w", err)
	}

	token := base64.URLEncoding.EncodeToString(bytes)
	return token, nil
}

func ValidateAccessToken(tokenString string, secretKey []byte) (*Claims, error) {
	if len(secretKey) == 0 {
		return nil, errors.New("secret key cannot be empty")
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secretKey, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, fmt.Errorf("parsing token: %w", err)
	}

	if !token.Valid {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return base64.URLEncoding.EncodeToString(hash[:])
}

func (j *JWT) GenerateTokenPair(userID uuid.UUID, email, fullName, roleName string, permissions []string) (*TokenPair, error) {
	accessToken, expiresAt, err := GenerateAccessToken(
		userID,
		email,
		fullName,
		roleName,
		permissions,
		j.secretKey,
		j.accessTokenExpiry,
	)
	if err != nil {
		return nil, fmt.Errorf("generating access token: %w", err)
	}

	refreshToken, err := GenerateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("generating refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
	}, nil
}

func (j *JWT) ValidateToken(tokenString string) (*Claims, error) {
	return ValidateAccessToken(tokenString, j.secretKey)
}

func (j *JWT) GetRefreshTokenExpiry() time.Time {
	return time.Now().Add(j.refreshTokenExpiry)
}
