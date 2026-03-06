package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/config"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/handler"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/middleware"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/queue"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/repository"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/repository/migrations"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/router"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/service"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/storage"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"go.uber.org/zap"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error starting assessment-service: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// ── Configuration ────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	// ── Logger ───────────────────────────────────────────────────────────────
	if err := utils.InitLogger(); err != nil {
		return fmt.Errorf("initialising logger: %w", err)
	}
	defer utils.Sync()

	logger := utils.GetLogger()

	// ── Database ─────────────────────────────────────────────────────────────
	db, err := repository.NewPostgresDatabase(cfg, logger)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer db.Close()

	// ── Migrations ───────────────────────────────────────────────────────────
	migrator := migrations.NewMigrator(db.DB, logger)
	if err := migrator.Run(); err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}

	// ── Object Storage (MinIO) ────────────────────────────────────────────────
	minioStorage, err := storage.NewMinIOStorage(
		cfg.MinIO.Endpoint,
		cfg.MinIO.AccessKey,
		cfg.MinIO.SecretKey,
		cfg.MinIO.BucketName,
		cfg.MinIO.UseSSL,
		logger,
	)
	if err != nil {
		// MinIO unavailability is a hard startup failure — the service cannot
		// accept submissions without object storage.
		return fmt.Errorf("connecting to minio: %w", err)
	}
	logger.Info("connected to minio",
		zap.String("endpoint", cfg.MinIO.Endpoint),
		zap.String("bucket", cfg.MinIO.BucketName),
	)

	// ── RabbitMQ ─────────────────────────────────────────────────────────────
	rmq, err := queue.NewRabbitMQ(cfg.RabbitMQ.URL, logger)
	if err != nil {
		return fmt.Errorf("connecting to rabbitmq: %w", err)
	}
	defer rmq.Close()

	// Watch for dropped connections and transparently reconnect in the
	// background.  This goroutine exits when rmq.Close() is called.
	go rmq.WatchReconnect()

	logger.Info("connected to rabbitmq", zap.String("url", cfg.RabbitMQ.URL))

	// ── External clients ─────────────────────────────────────────────────────
	auditClient := client.NewAuditClient(cfg.IAMServiceURL, logger)
	academicClient := client.NewAcademicClient(cfg.AcademicSvcURL, logger)
	judge0Client := client.NewJudge0Client(cfg.Judge0.URL, cfg.Judge0.APIKey, cfg.Judge0.Timeout, logger)

	// ── Repositories ─────────────────────────────────────────────────────────
	assignmentRepo := repository.NewAssignmentRepository(db.DB)
	submissionRepo := repository.NewSubmissionRepository(db.DB)
	groupRepo := repository.NewGroupRepository(db.DB)

	// ── Message queue: publisher + worker + consumer ──────────────────────────
	submissionPublisher := queue.NewSubmissionPublisher(rmq, logger)

	// Create evaluation service for test case evaluation
	evaluationService := service.NewEvaluationService(judge0Client, logger)

	submissionWorker := service.NewSubmissionWorker(
		submissionRepo,
		assignmentRepo,
		minioStorage,
		auditClient,
		judge0Client,
		evaluationService,
		db.DB,
		logger,
	)

	submissionConsumer := queue.NewSubmissionConsumer(
		rmq,
		submissionWorker,
		cfg.RabbitMQ.SubmissionWorkers,
		logger,
	)

	// ── Services ─────────────────────────────────────────────────────────────
	contentRepo := repository.NewAssignmentContentRepository(db.DB)

	assignmentService := service.NewAssignmentService(assignmentRepo, contentRepo, auditClient, logger)

	submissionService := service.NewSubmissionService(
		submissionRepo,
		groupRepo,
		assignmentRepo,
		contentRepo,
		minioStorage,
		submissionPublisher,
		auditClient,
		academicClient,
		judge0Client,
		cfg.Judge0.MaxPayloadSize,
		db.DB,
		logger,
	)

	groupService := service.NewGroupService(
		groupRepo,
		assignmentRepo,
		auditClient,
		logger,
	)

	// ── Handlers ─────────────────────────────────────────────────────────────
	healthHandler := handler.NewHealthHandler()
	assignmentHandler := handler.NewAssignmentHandler(assignmentService, logger)
	submissionHandler := handler.NewSubmissionHandler(submissionService, logger)
	groupHandler := handler.NewGroupHandler(groupService, logger)
	instructorHandler := handler.NewInstructorHandler(assignmentService, submissionService, academicClient, logger)
	studentHandler := handler.NewStudentHandler(assignmentService, submissionService, academicClient, logger)
	// ── Fiber app ────────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:      "assessment-service",
		ErrorHandler: utils.ErrorHandler,
	})

	app.Use(middleware.Recovery())
	app.Use(middleware.Logger())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.FrontendURL, "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID"},
		AllowCredentials: true,
	}))

	// ── Routes ───────────────────────────────────────────────────────────────
	router.SetupRoutes(app, router.Config{
		HealthHandler:     healthHandler,
		AssignmentHandler: assignmentHandler,
		SubmissionHandler: submissionHandler,
		GroupHandler:      groupHandler,
		InstructorHandler: instructorHandler, StudentHandler: studentHandler, JWTSecretKey: []byte(cfg.JWT.SecretKey),
	})

	// ── Graceful shutdown ────────────────────────────────────────────────────
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Consumer context — cancelled on shutdown so the consumer drains
	// in-flight jobs before the process exits.
	consumerCtx, cancelConsumer := context.WithCancel(context.Background())
	defer cancelConsumer()

	// Start the submission consumer pool in the background.
	go submissionConsumer.Start(consumerCtx)

	logger.Info("submission consumer pool started",
		zap.Int("workers", cfg.RabbitMQ.SubmissionWorkers),
	)

	go func() {
		addr := fmt.Sprintf(":%s", cfg.Server.Port)
		logger.Info("starting server", zap.String("address", addr))

		if err := app.Listen(addr); err != nil {
			logger.Error("server listen error", zap.Error(err))
		}
	}()

	<-sigChan
	logger.Info("shutdown signal received, stopping server...")

	// 1. Stop accepting new HTTP requests.
	httpCtx, httpCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer httpCancel()

	if err := app.ShutdownWithContext(httpCtx); err != nil {
		logger.Error("server shutdown error", zap.Error(err))
		return fmt.Errorf("shutting down server: %w", err)
	}

	// 2. Signal the consumer to drain remaining jobs.
	cancelConsumer()

	// Allow up to 30 s for the consumer to finish in-flight processing before
	// the process exits.  The defer on consumerCtx cancel is already called,
	// but we give the goroutine time to finish its current job.
	logger.Info("waiting for submission consumer to drain...")
	time.Sleep(2 * time.Second)

	logger.Info("server stopped gracefully")
	return nil
}
