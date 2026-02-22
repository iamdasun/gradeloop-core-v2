package service

import (
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/repository"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// CourseService defines the business-logic contract for course management.
type CourseService interface {
	CreateCourse(req *dto.CreateCourseRequest, username, ipAddress, userAgent string) (*domain.Course, error)
	UpdateCourse(id uuid.UUID, req *dto.UpdateCourseRequest, username, ipAddress, userAgent string) (*domain.Course, error)
	DeactivateCourse(id uuid.UUID, username, ipAddress, userAgent string) error
	GetCourse(id uuid.UUID) (*domain.Course, error)
	ListCourses(includeInactive bool) ([]domain.Course, error)

	// Prerequisite management
	AddPrerequisite(courseID uuid.UUID, req *dto.AddPrerequisiteRequest, username, ipAddress, userAgent string) (*domain.CoursePrerequisite, error)
	RemovePrerequisite(courseID, prerequisiteCourseID uuid.UUID, username, ipAddress, userAgent string) error
	ListPrerequisites(courseID uuid.UUID) ([]domain.CoursePrerequisite, error)
}

// courseService is the concrete implementation.
type courseService struct {
	courseRepo  repository.CourseRepository
	auditClient *client.AuditClient
	logger      *zap.Logger
}

// NewCourseService wires all dependencies together.
func NewCourseService(
	courseRepo repository.CourseRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) CourseService {
	return &courseService{
		courseRepo:  courseRepo,
		auditClient: auditClient,
		logger:      logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateCourse
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) CreateCourse(
	req *dto.CreateCourseRequest,
	username, ipAddress, userAgent string,
) (*domain.Course, error) {
	// Validate required fields
	if req.Code == "" {
		return nil, utils.ErrBadRequest("code is required")
	}
	if req.Title == "" {
		return nil, utils.ErrBadRequest("title is required")
	}
	if req.Credits < 0 {
		return nil, utils.ErrBadRequest("credits must be a non-negative integer")
	}

	// Enforce unique code
	existing, err := s.courseRepo.GetByCode(req.Code)
	if err != nil {
		s.logger.Error("failed to check course code uniqueness", zap.Error(err))
		return nil, utils.ErrInternal("failed to check course code uniqueness", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("a course with this code already exists")
	}

	course := &domain.Course{
		Code:        req.Code,
		Title:       req.Title,
		Description: req.Description,
		Credits:     req.Credits,
		IsActive:    true,
	}

	if err := s.courseRepo.Create(course); err != nil {
		s.logger.Error("failed to create course", zap.Error(err))
		return nil, utils.ErrInternal("failed to create course", err)
	}

	changes := map[string]interface{}{
		"code":    course.Code,
		"title":   course.Title,
		"credits": course.Credits,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseCreated),
		"course",
		course.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("course created", zap.String("id", course.ID.String()), zap.String("code", course.Code))
	return course, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateCourse
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) UpdateCourse(
	id uuid.UUID,
	req *dto.UpdateCourseRequest,
	username, ipAddress, userAgent string,
) (*domain.Course, error) {
	course, err := s.courseRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load course", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course", err)
	}
	if course == nil {
		return nil, utils.ErrNotFound("course not found")
	}

	changes := make(map[string]interface{})

	if req.Title != "" && req.Title != course.Title {
		changes["title"] = map[string]interface{}{"from": course.Title, "to": req.Title}
		course.Title = req.Title
	}
	if req.Description != course.Description {
		changes["description"] = map[string]interface{}{"from": course.Description, "to": req.Description}
		course.Description = req.Description
	}
	if req.Credits != nil && *req.Credits != course.Credits {
		if *req.Credits < 0 {
			return nil, utils.ErrBadRequest("credits must be a non-negative integer")
		}
		changes["credits"] = map[string]interface{}{"from": course.Credits, "to": *req.Credits}
		course.Credits = *req.Credits
	}
	if req.IsActive != nil && *req.IsActive != course.IsActive {
		changes["is_active"] = map[string]interface{}{"from": course.IsActive, "to": *req.IsActive}
		course.IsActive = *req.IsActive
	}

	if err := s.courseRepo.Update(course); err != nil {
		s.logger.Error("failed to update course", zap.Error(err))
		return nil, utils.ErrInternal("failed to update course", err)
	}

	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseUpdated),
		"course",
		course.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("course updated", zap.String("id", course.ID.String()))
	return course, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// DeactivateCourse
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) DeactivateCourse(
	id uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	course, err := s.courseRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load course", zap.Error(err))
		return utils.ErrInternal("failed to load course", err)
	}
	if course == nil {
		return utils.ErrNotFound("course not found")
	}
	if !course.IsActive {
		return utils.ErrBadRequest("course is already inactive")
	}

	course.IsActive = false
	if err := s.courseRepo.Update(course); err != nil {
		s.logger.Error("failed to deactivate course", zap.Error(err))
		return utils.ErrInternal("failed to deactivate course", err)
	}

	changes := map[string]interface{}{
		"is_active": map[string]interface{}{"from": true, "to": false},
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseDeactivated),
		"course",
		course.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("course deactivated", zap.String("id", course.ID.String()))
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetCourse
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) GetCourse(id uuid.UUID) (*domain.Course, error) {
	course, err := s.courseRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load course", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course", err)
	}
	if course == nil {
		return nil, utils.ErrNotFound("course not found")
	}
	return course, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListCourses
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) ListCourses(includeInactive bool) ([]domain.Course, error) {
	courses, err := s.courseRepo.List(includeInactive)
	if err != nil {
		s.logger.Error("failed to list courses", zap.Error(err))
		return nil, utils.ErrInternal("failed to list courses", err)
	}
	return courses, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// AddPrerequisite
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) AddPrerequisite(
	courseID uuid.UUID,
	req *dto.AddPrerequisiteRequest,
	username, ipAddress, userAgent string,
) (*domain.CoursePrerequisite, error) {
	if req.PrerequisiteCourseID == uuid.Nil {
		return nil, utils.ErrBadRequest("prerequisite_course_id is required")
	}
	if courseID == req.PrerequisiteCourseID {
		return nil, utils.ErrBadRequest("a course cannot be a prerequisite of itself")
	}

	// Verify the parent course exists
	course, err := s.courseRepo.GetByID(courseID)
	if err != nil {
		s.logger.Error("failed to load course", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course", err)
	}
	if course == nil {
		return nil, utils.ErrNotFound("course not found")
	}

	// Verify the prerequisite course exists
	prereqCourse, err := s.courseRepo.GetByID(req.PrerequisiteCourseID)
	if err != nil {
		s.logger.Error("failed to load prerequisite course", zap.Error(err))
		return nil, utils.ErrInternal("failed to load prerequisite course", err)
	}
	if prereqCourse == nil {
		return nil, utils.ErrNotFound("prerequisite course not found")
	}

	// Prevent duplicate
	exists, err := s.courseRepo.PrerequisiteExists(courseID, req.PrerequisiteCourseID)
	if err != nil {
		s.logger.Error("failed to check prerequisite existence", zap.Error(err))
		return nil, utils.ErrInternal("failed to check prerequisite existence", err)
	}
	if exists {
		return nil, utils.ErrConflict("this prerequisite relationship already exists")
	}

	prereq := &domain.CoursePrerequisite{
		CourseID:             courseID,
		PrerequisiteCourseID: req.PrerequisiteCourseID,
	}

	if err := s.courseRepo.AddPrerequisite(prereq); err != nil {
		s.logger.Error("failed to add prerequisite", zap.Error(err))
		return nil, utils.ErrInternal("failed to add prerequisite", err)
	}

	changes := map[string]interface{}{
		"course_id":              courseID.String(),
		"prerequisite_course_id": req.PrerequisiteCourseID.String(),
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCoursePrerequisiteAdded),
		"course_prerequisite",
		courseID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	prereq.PrerequisiteCourse = prereqCourse
	s.logger.Info("course prerequisite added",
		zap.String("course_id", courseID.String()),
		zap.String("prerequisite_course_id", req.PrerequisiteCourseID.String()),
	)
	return prereq, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// RemovePrerequisite
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) RemovePrerequisite(
	courseID, prerequisiteCourseID uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	exists, err := s.courseRepo.PrerequisiteExists(courseID, prerequisiteCourseID)
	if err != nil {
		s.logger.Error("failed to check prerequisite existence", zap.Error(err))
		return utils.ErrInternal("failed to check prerequisite existence", err)
	}
	if !exists {
		return utils.ErrNotFound("prerequisite relationship not found")
	}

	if err := s.courseRepo.RemovePrerequisite(courseID, prerequisiteCourseID); err != nil {
		s.logger.Error("failed to remove prerequisite", zap.Error(err))
		return utils.ErrInternal("failed to remove prerequisite", err)
	}

	changes := map[string]interface{}{
		"course_id":              courseID.String(),
		"prerequisite_course_id": prerequisiteCourseID.String(),
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCoursePrerequisiteRemoved),
		"course_prerequisite",
		courseID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("course prerequisite removed",
		zap.String("course_id", courseID.String()),
		zap.String("prerequisite_course_id", prerequisiteCourseID.String()),
	)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListPrerequisites
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseService) ListPrerequisites(courseID uuid.UUID) ([]domain.CoursePrerequisite, error) {
	exists, err := s.courseRepo.Exists(courseID)
	if err != nil {
		s.logger.Error("failed to check course existence", zap.Error(err))
		return nil, utils.ErrInternal("failed to check course existence", err)
	}
	if !exists {
		return nil, utils.ErrNotFound("course not found")
	}

	prereqs, err := s.courseRepo.ListPrerequisites(courseID)
	if err != nil {
		s.logger.Error("failed to list prerequisites", zap.Error(err))
		return nil, utils.ErrInternal("failed to list prerequisites", err)
	}
	return prereqs, nil
}
