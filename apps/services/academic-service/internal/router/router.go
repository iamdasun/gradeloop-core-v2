package router

import (
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
	StudentHandler          *handler.StudentHandler
	JWTSecretKey            []byte
}

// requireAdminRole is a custom middleware that checks for super_admin OR admin user types
func requireAdminRole() fiber.Handler {
	return func(c fiber.Ctx) error {
		userType, ok := c.Locals("user_type").(string)
		if !ok || userType == "" {
			return utils.ErrForbidden("No user type found")
		}

		// Check if user has super_admin or admin user type
		if userType == "super_admin" || userType == "admin" {
			return c.Next()
		}

		return utils.ErrForbidden("Requires super_admin or admin user type")
	}
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)

	// API v1 group
	api := app.Group("/api/v1")

	// Protected routes (require authentication)
	protected := api.Group("", middleware.AuthMiddleware(cfg.JWTSecretKey))

	// Faculty routes - Super Admin only
	faculties := protected.Group("/faculties", middleware.RequireUserType("super_admin"))
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
	courses.Get("/:id/course-instances", cfg.CourseInstanceHandler.ListCourseInstancesByCourse)

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
	// Instructor-scoped routes (instructor + admin + super_admin)
	// PathPrefix: /api/v1/instructor-courses — routed by Traefik to academic-service
	// NOTE: static sub-paths (/me, /batches) must be registered BEFORE /:id
	// so that Fiber doesn't interpret them as UUID parameters.
	// ─────────────────────────────────────────────────────────────────────────────
	instructorCourses := protected.Group("/instructor-courses",
		middleware.RequireAnyUserType("instructor", "admin", "super_admin"))
	instructorCourses.Get("/me", cfg.InstructorHandler.GetMyCourses)
	// Static paths before /:id
	instructorCourses.Get("/batches", cfg.InstructorHandler.ListAvailableBatches)
	// Instance-scoped reads
	instructorCourses.Get("/:id/students", cfg.InstructorHandler.GetMyStudents)
	instructorCourses.Get("/:id/instructors", cfg.InstructorHandler.GetMyInstructors)
	instructorCourses.Get("/:id/enrolled-batches", cfg.InstructorHandler.GetEnrolledBatches)
	// Instance-scoped mutations
	instructorCourses.Post("/:id/enrollments", cfg.InstructorHandler.EnrollStudent)
	instructorCourses.Delete("/:id/students/:userID", cfg.InstructorHandler.UnenrollStudent)
	instructorCourses.Post("/:id/enroll-batch", cfg.InstructorHandler.EnrollBatch)
	instructorCourses.Delete("/:id/enrolled-batches/:batchID", cfg.InstructorHandler.UnenrollBatch)

	// ─────────────────────────────────────────────────────────────────────────
	// Student-scoped routes (student + admin + super_admin)
	// PathPrefix: /api/v1/student-courses — routed by Traefik to academic-service
	// ─────────────────────────────────────────────────────────────────────────
	studentCourses := protected.Group("/student-courses",
		middleware.RequireAnyUserType("student", "admin", "super_admin"))
	studentCourses.Get("/me", cfg.StudentHandler.GetMyCourses)
	studentCourses.Get("/:id", cfg.StudentHandler.GetCourseInstance)
	studentCourses.Get("/:id/instructors", cfg.StudentHandler.GetCourseInstructors)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "academic-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})

	// Debug endpoint to check auth and user type
	protected.Get("/debug/auth", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":       c.Locals("user_id"),
			"username":      c.Locals("username"),
			"user_type":     c.Locals("user_type"),
			"authenticated": true,
		})
	})
}
