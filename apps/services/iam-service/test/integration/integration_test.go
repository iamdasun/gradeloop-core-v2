package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/repository"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type mockEmailClient struct {
	lastLink string
}

func (m *mockEmailClient) SendPasswordResetEmail(ctx context.Context, to, name, link string) error {
	m.lastLink = link
	return nil
}

func (m *mockEmailClient) SendWelcomeEmail(ctx context.Context, to, name, password string) error {
	m.lastLink = password // hacking this to verify password was sent
	return nil
}

func TestIntegration_UserFlow(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test")
	}

	ctx := context.Background()

	// Start Postgres Container
	bgUser := "testuser"
	bgPassword := "testpassword"
	bgDbName := "testdb"

	pgContainer, err := postgres.RunContainer(ctx,
		testcontainers.WithImage("postgres:15-alpine"),
		postgres.WithDatabase(bgDbName),
		postgres.WithUsername(bgUser),
		postgres.WithPassword(bgPassword),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(5*time.Second),
		),
	)
	require.NoError(t, err)

	t.Cleanup(func() {
		if err := pgContainer.Terminate(ctx); err != nil {
			t.Fatalf("failed to terminate container: %s", err)
		}
	})

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	// Connect GORM
	db, err := gorm.Open(gormpg.Open(connStr), &gorm.Config{})
	require.NoError(t, err)

	// Migrations
	err = db.AutoMigrate(
		&domain.User{},
		&domain.Role{},
		&domain.Permission{},
		&domain.AuditLog{},
		&domain.PasswordResetToken{},
		&domain.RefreshToken{},
	)
	require.NoError(t, err)

	// Setup Services
	userRepo := repository.NewUserRepository(db)
	roleRepo := repository.NewRoleRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	tokenRepo := repository.NewRefreshTokenRepository(db)
	passwdRepo := repository.NewPasswordResetRepository(db)

	localEmailClient := &mockEmailClient{}
	userService := service.NewUserService(userRepo, roleRepo, auditRepo, passwdRepo, localEmailClient)
	authService := service.NewAuthService(userRepo, tokenRepo, passwdRepo, auditRepo, localEmailClient)

	// Test 1: Create User
	t.Run("CreateUser", func(t *testing.T) {
		req := dto.CreateUserRequest{
			Email:        "integration@example.com",
			FullName:     "Integration User",
			UserType:     "EMPLOYEE",
			EmployeeID:   &[]string{"INT001"}[0],
			Designation:  &[]string{"Tester"}[0],
			EmployeeType: &[]string{"Bot"}[0],
		}

		user, err := userService.CreateUser(ctx, req)
		require.NoError(t, err)
		assert.NotEmpty(t, user.ID)
		assert.False(t, user.IsActive)

		// Verify Token Sent
		assert.NotEmpty(t, localEmailClient.lastLink)
		// Extract token from link (simple parse)
		// Link format: https://gradeloop.com/auth/verify-account?token=<token>
		// We can just take the last part after "token="
		assert.Contains(t, localEmailClient.lastLink, "token=")
		token := localEmailClient.lastLink[len("https://gradeloop.com/auth/verify-account?token="):]

		// Test 2: Reset Password and Activate
		t.Run("ResetPassword", func(t *testing.T) {
			newPass := "NewPassword123!"
			err := authService.ResetPassword(ctx, token, newPass)
			require.NoError(t, err)

			// Verify User Active
			updatedUser, err := userService.GetUser(ctx, user.ID)
			require.NoError(t, err)
			assert.True(t, updatedUser.IsActive)

			// Test 3: Login
			t.Run("Login", func(t *testing.T) {
				loginReq := dto.LoginRequest{
					Email:    "integration@example.com",
					Password: newPass,
				}

				res, err := authService.Login(ctx, loginReq, "127.0.0.1", "test-agent")
				require.NoError(t, err)
				assert.NotEmpty(t, res.AccessToken)
				assert.NotEmpty(t, res.RefreshToken)
			})
		})
	})
}
