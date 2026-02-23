/**
 * Academics service — TypeScript types.
 *
 * These types mirror the backend Go DTOs exactly.
 * Source of truth: apps/services/academic-service/internal/dto/
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export const DEGREE_LEVELS = [
  'Undergraduate',
  'Postgraduate',
  'Doctoral',
  'Diploma',
  'Certificate',
] as const;

export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const SEMESTER_TERM_TYPES = ['Fall', 'Spring', 'Summer', 'Winter'] as const;
export type SemesterTermType = (typeof SEMESTER_TERM_TYPES)[number];

export const SEMESTER_STATUSES = ['Planned', 'Active', 'Completed', 'Cancelled'] as const;
export type SemesterStatus = (typeof SEMESTER_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['Enrolled', 'Dropped', 'Completed', 'Failed'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const BATCH_MEMBER_STATUSES = ['Active', 'Graduated', 'Suspended', 'Withdrawn'] as const;
export type BatchMemberStatus = (typeof BATCH_MEMBER_STATUSES)[number];

export const COURSE_INSTANCE_STATUSES = ['Planned', 'Active', 'Completed', 'Cancelled'] as const;
export type CourseInstanceStatus = (typeof COURSE_INSTANCE_STATUSES)[number];

export const INSTRUCTOR_ROLES = ['Lead Instructor', 'Instructor', 'TA'] as const;
export type InstructorRole = (typeof INSTRUCTOR_ROLES)[number];

// ─── Entity types (match backend DTOs exactly) ───────────────────────────────

export interface Faculty {
  id: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  leaders?: FacultyLeadership[];
}

export interface FacultyLeadership {
  faculty_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  faculty_id: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Degree {
  id: string;
  department_id: string;
  name: string;
  code: string;
  level: DegreeLevel;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  description: string;
  credits: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Specialization {
  id: string;
  degree_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  parent_id: string | null;
  degree_id: string;
  specialization_id: string | null;
  name: string;
  code: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BatchTreeNode {
  id: string;
  parent_id: string | null;
  degree_id: string;
  specialization_id: string | null;
  name: string;
  code: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  children: BatchTreeNode[];
}

export interface BatchMember {
  batch_id: string;
  user_id: string;
  status: BatchMemberStatus;
  enrolled_at: string;
}

export interface Semester {
  id: string;
  name: string;
  code: string;
  term_type: SemesterTermType;
  start_date: string;
  end_date: string;
  status: SemesterStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseInstance {
  id: string;
  course_id: string;
  semester_id: string;
  batch_id: string;
  status: CourseInstanceStatus;
  max_enrollment: number;
  created_at: string;
  updated_at: string;
}

export interface CourseInstructor {
  course_instance_id: string;
  user_id: string;
  role: string;
}

export interface Enrollment {
  course_instance_id: string;
  user_id: string;
  status: EnrollmentStatus;
  final_grade?: string;
  enrolled_at: string;
}

export interface CoursePrerequisite {
  course_id: string;
  prerequisite_course_id: string;
  prerequisite_course?: Course;
}

// ─── Request types ────────────────────────────────────────────────────────────

export interface CreateLeadershipRequest {
  user_id: string;
  role: string;
}

export interface CreateFacultyRequest {
  name: string;
  code: string;
  description?: string;
  leaders: CreateLeadershipRequest[];
}

export interface UpdateFacultyRequest {
  name?: string;
  code?: string;
  description?: string;
  is_active?: boolean;
  leaders?: CreateLeadershipRequest[];
}

export interface CreateDepartmentRequest {
  faculty_id: string;
  name: string;
  code: string;
  description?: string;
}

export interface UpdateDepartmentRequest {
  name?: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

export interface CreateDegreeRequest {
  department_id: string;
  name: string;
  code: string;
  level: DegreeLevel;
}

export interface UpdateDegreeRequest {
  name?: string;
  code?: string;
  level?: DegreeLevel;
  is_active?: boolean;
}

export interface CreateCourseRequest {
  code: string;
  title: string;
  description?: string;
  credits: number;
}

export interface UpdateCourseRequest {
  title?: string;
  description?: string;
  credits?: number;
  is_active?: boolean;
}

export interface CreateSpecializationRequest {
  degree_id: string;
  name: string;
  code: string;
}

export interface UpdateSpecializationRequest {
  name?: string;
  code?: string;
  is_active?: boolean;
}

export interface CreateBatchRequest {
  parent_id?: string | null;
  degree_id?: string;
  specialization_id?: string | null;
  name: string;
  code: string;
  start_year: number;
  end_year: number;
}

export interface UpdateBatchRequest {
  specialization_id?: string | null;
  name?: string;
  start_year?: number;
  end_year?: number;
  is_active?: boolean;
}

export interface AddBatchMemberRequest {
  batch_id: string;
  user_id: string;
  status: BatchMemberStatus;
}

export interface CreateSemesterRequest {
  name: string;
  code: string;
  term_type: SemesterTermType;
  start_date: string;
  end_date: string;
  status: SemesterStatus;
}

export interface UpdateSemesterRequest {
  name?: string;
  term_type?: SemesterTermType;
  start_date?: string;
  end_date?: string;
  status?: SemesterStatus;
  is_active?: boolean;
}

export interface CreateCourseInstanceRequest {
  course_id: string;
  semester_id: string;
  batch_id: string;
  status: CourseInstanceStatus;
  max_enrollment: number;
}

export interface UpdateCourseInstanceRequest {
  status?: string;
  max_enrollment?: number;
}

export interface AssignInstructorRequest {
  course_instance_id: string;
  user_id: string;
  role: string;
}

export interface EnrollStudentRequest {
  course_instance_id: string;
  user_id: string;
  status: EnrollmentStatus;
}

export interface UpdateEnrollmentRequest {
  status?: string;
  final_grade?: string;
}

export interface AddPrerequisiteRequest {
  prerequisite_course_id: string;
}

// ─── API list-response wrappers ───────────────────────────────────────────────

export interface FacultyListResponse {
  faculties: Faculty[];
  count: number;
}

export interface DepartmentListResponse {
  departments: Department[];
  count: number;
}

export interface DegreeListResponse {
  degrees: Degree[];
  count: number;
}

export interface CourseListResponse {
  courses: Course[];
  count: number;
}

export interface SemesterListResponse {
  semesters: Semester[];
  count: number;
}

export interface BatchListResponse {
  batches: Batch[];
  count: number;
}

// ─── Form validation helpers ──────────────────────────────────────────────────

export interface AcademicFormErrors {
  [field: string]: string | undefined;
}
