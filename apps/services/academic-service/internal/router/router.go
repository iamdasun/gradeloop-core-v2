package router

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/handler"
	"github.com/gradeloop/academic-service/internal/middleware"
	"github.com/gradeloop/academic-service/internal/utils"
)

type Config struct {
	HealthHandler           *handler.HealthHandler
	FacultyHandler          *handler.FacultyHandler
	DepartmentHandler       *handler.DepartmentHandler
	DegreeHandler           *handler.DegreeHandler
	SpecializationHandler   *handler.SpecializationHandler
	BatchHandler            *handler.BatchHandler
	BatchMemberHandler      *handler.BatchMemberHandler
	CourseInstanceHandler   *handler.CourseInstanceHandler
	CourseInstructorHandler *handler.CourseInstructorHandler
	EnrollmentHandler       *handler.EnrollmentHandler
	CourseHandler           *handler.CourseHandler
	SemesterHandler         *handler.SemesterHandler
	InstructorHandler       *handler.InstructorHandler
	JWTSecretKey            []byte
}

// requireAdminRole is a custom middleware that checks for super_admin OR admin
func requireAdminRole() fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return utils.ErrForbidden("No role found")
		}

		// Normalize role name (lowercase, replace spaces with underscores)
		normalized := strings.ToLower(strings.TrimSpace(roleName))
		normalized = strings.ReplaceAll(normalized, " ", "_")

		// Check if user has super_admin or admin role
		if normalized == "super_admin" || normalized == "admin" {
			return c.Next()
		}

		return utils.ErrForbidden("Requires super_admin or admin role")
	}
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)

	// API v1 group
	api := app.Group("/api/v1")

	// Protected routes (require authentication)
	protected := api.Group("", middleware.AuthMiddleware(cfg.JWTSecretKey))

	// Faculty routes - Super Admin only
	faculties := protected.Group("/faculties", middleware.RequireRole("super_admin"))
	faculties.Post("/", cfg.FacultyHandler.CreateFaculty)
	faculties.Get("/", cfg.FacultyHandler.ListFaculties)
	faculties.Get("/:id", cfg.FacultyHandler.GetFaculty)
	faculties.Put("/:id", cfg.FacultyHandler.UpdateFaculty)
	faculties.Patch("/:id/deactivate", cfg.FacultyHandler.DeactivateFaculty)
	faculties.Get("/:id/leaders", cfg.FacultyHandler.GetFacultyLeaders)

	// Department routes - Super Admin OR Admin
	departments := protected.Group("/departments", requireAdminRole())
	departments.Post("/", cfg.DepartmentHandler.CreateDepartment)
	departments.Get("/", cfg.DepartmentHandler.ListDepartments)
	// List degrees for a department
	departments.Get("/:id/degrees", cfg.DegreeHandler.ListDegreesByDepartment)
	departments.Get("/:id", cfg.DepartmentHandler.GetDepartment)
	departments.Put("/:id", cfg.DepartmentHandler.UpdateDepartment)
	departments.Patch("/:id/deactivate", cfg.DepartmentHandler.DeactivateDepartment)

	// Faculty departments endpoint - Super Admin OR Admin
	facultiesAdmin := protected.Group("/faculties", requireAdminRole())
	facultiesAdmin.Get("/:id/departments", cfg.DepartmentHandler.ListDepartmentsByFaculty)

	// Degree routes - Super Admin OR Admin
	degrees := protected.Group("/degrees", requireAdminRole())
	degrees.Post("/", cfg.DegreeHandler.CreateDegree)
	degrees.Get("/", cfg.DegreeHandler.ListDegrees)
	degrees.Get("/:id", cfg.DegreeHandler.GetDegree)
	degrees.Put("/:id", cfg.DegreeHandler.UpdateDegree)
	degrees.Patch("/:id/deactivate", cfg.DegreeHandler.DeactivateDegree)
	// List specializations for a degree
	degrees.Get("/:id/specializations", cfg.SpecializationHandler.ListSpecializationsByDegree)

	// Specialization routes - Super Admin OR Admin
	specializations := protected.Group("/specializations", requireAdminRole())
	specializations.Post("/", cfg.SpecializationHandler.CreateSpecialization)
	specializations.Get("/:id", cfg.SpecializationHandler.GetSpecialization)
	specializations.Put("/:id", cfg.SpecializationHandler.UpdateSpecialization)
	specializations.Patch("/:id/deactivate", cfg.SpecializationHandler.DeactivateSpecialization)

	// ─────────────────────────────────────────────────────────────────────────
	// Batch / Group routes - Super Admin OR Admin
	// NOTE: /batches/tree must be registered BEFORE /batches/:id to avoid
	// Fiber treating "tree" as a UUID parameter.
	// ─────────────────────────────────────────────────────────────────────────
	batches := protected.Group("/batches", requireAdminRole())
	batches.Post("/", cfg.BatchHandler.CreateBatch)
	batches.Get("/", cfg.BatchHandler.ListBatches)
	batches.Get("/tree", cfg.BatchHandler.GetBatchTree)
	batches.Get("/:id/tree", cfg.BatchHandler.GetBatchSubtree)
	batches.Get("/:id", cfg.BatchHandler.GetBatch)
	batches.Put("/:id", cfg.BatchHandler.UpdateBatch)
	batches.Patch("/:id/deactivate", cfg.BatchHandler.DeactivateBatch)

	// ─────────────────────────────────────────────────────────────────────────
	// Batch member routes
	// NOTE: GET /batches/:id/members is nested under the existing batches group
	// so it naturally inherits the requireAdminRole() middleware.
	// ─────────────────────────────────────────────────────────────────────────
	batchMembers := protected.Group("/batch-members", requireAdminRole())
	batchMembers.Post("/", cfg.BatchMemberHandler.AddBatchMember)
	batchMembers.Post("/bulk", cfg.BatchMemberHandler.AddMembersToBatch)
	batchMembers.Delete("/:batchID/:userID", cfg.BatchMemberHandler.RemoveBatchMember)

	// Nested under /batches/:id  (shares the already-protected batches group)
	batches.Get("/:id/members", cfg.BatchMemberHandler.GetBatchMembers)
	batches.Get("/:id/members/detailed", cfg.BatchMemberHandler.GetBatchMembersDetailed)
	batches.Get("/:id/course-instances", cfg.CourseInstanceHandler.ListCourseInstancesByBatch)

	// ─────────────────────────────────────────────────────────────────────────
	// Course instance routes
	// ─────────────────────────────────────────────────────────────────────────
	courseInstances := protected.Group("/course-instances", requireAdminRole())
	courseInstances.Post("/", cfg.CourseInstanceHandler.CreateCourseInstance)
	courseInstances.Put("/:id", cfg.CourseInstanceHandler.UpdateCourseInstance)
	courseInstances.Get("/:id", cfg.CourseInstanceHandler.GetCourseInstanceByID)
	// Nested reads under course-instances (instructors & enrollments)
	courseInstances.Get("/:id/instructors", cfg.CourseInstructorHandler.GetInstructors)
	courseInstances.Get("/:id/enrollments", cfg.EnrollmentHandler.GetEnrollments)

	// ─────────────────────────────────────────────────────────────────────────
	// Course instructor routes
	// ─────────────────────────────────────────────────────────────────────────
	courseInstructors := protected.Group("/course-instructors", requireAdminRole())
	courseInstructors.Post("/", cfg.CourseInstructorHandler.AssignInstructor)
	courseInstructors.Delete("/:instanceID/:userID", cfg.CourseInstructorHandler.RemoveInstructor)

	// ─────────────────────────────────────────────────────────────────────────
	// Enrollment routes
	// ─────────────────────────────────────────────────────────────────────────
	enrollments := protected.Group("/enrollments", requireAdminRole())
	enrollments.Post("/", cfg.EnrollmentHandler.EnrollStudent)
	enrollments.Put("/:instanceID/:userID", cfg.EnrollmentHandler.UpdateEnrollment)

	// ─────────────────────────────────────────────────────────────────────────
	// Course routes
	// NOTE: /courses/:id/prerequisites must be registered after /courses/:id
	// ─────────────────────────────────────────────────────────────────────────
	courses := protected.Group("/courses", requireAdminRole())
	courses.Post("/", cfg.CourseHandler.CreateCourse)
	courses.Get("/", cfg.CourseHandler.ListCourses)
	courses.Get("/:id", cfg.CourseHandler.GetCourse)
	courses.Put("/:id", cfg.CourseHandler.UpdateCourse)
	courses.Patch("/:id/deactivate", cfg.CourseHandler.DeactivateCourse)
	courses.Post("/:id/prerequisites", cfg.CourseHandler.AddPrerequisite)
	courses.Get("/:id/prerequisites", cfg.CourseHandler.ListPrerequisites)
	courses.Delete("/:id/prerequisites/:prereqID", cfg.CourseHandler.RemovePrerequisite)

	// ─────────────────────────────────────────────────────────────────────────
	// Semester routes
	// ─────────────────────────────────────────────────────────────────────────
	semesters := protected.Group("/semesters", requireAdminRole())
	semesters.Post("/", cfg.SemesterHandler.CreateSemester)
	semesters.Get("/", cfg.SemesterHandler.ListSemesters)
	semesters.Get("/:id", cfg.SemesterHandler.GetSemester)
	semesters.Put("/:id", cfg.SemesterHandler.UpdateSemester)
	semesters.Patch("/:id/deactivate", cfg.SemesterHandler.DeactivateSemester)

	// ─────────────────────────────────────────────────────────────────────────
	// Instructor-scoped routes (Employee + Admin + Super Admin)
	// PathPrefix: /api/v1/instructor-courses — routed by Traefik to academic-service
	// ─────────────────────────────────────────────────────────────────────────
	instructorCourses := protected.Group("/instructor-courses",
		middleware.RequireAnyRole("Employee", "Admin", "Super Admin"))
	instructorCourses.Get("/me", cfg.InstructorHandler.GetMyCourses)
	instructorCourses.Get("/:id/students", cfg.InstructorHandler.GetMyStudents)
	instructorCourses.Get("/:id/instructors", cfg.InstructorHandler.GetMyInstructors)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "academic-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})

	// Debug endpoint to check auth and role
	protected.Get("/debug/auth", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":       c.Locals("user_id"),
			"username":      c.Locals("username"),
			"role_name":     c.Locals("role_name"),
			"permissions":   c.Locals("permissions"),
			"authenticated": true,
		})
	})
}
