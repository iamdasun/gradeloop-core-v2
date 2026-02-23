/**
 * Academics service API client.
 *
 * All list endpoints return a wrapped object, e.g.
 *   GET /departments → { departments: [...], count: N }
 * Single-entity endpoints (GET/:id, POST, PUT) return the entity directly.
 *
 * Gateway coverage (Traefik):
 *   ✅ /api/v1/faculties
 *   ✅ /api/v1/departments
 *   ✅ /api/v1/degrees
 *   ✅ /api/v1/specializations
 *   ✅ /api/v1/courses
 *   ✅ /api/v1/semesters
 *   ✅ /api/v1/batches
 *   ✅ /api/v1/batch-members
 *   ✅ /api/v1/course-instances
 *   ✅ /api/v1/course-instructors
 *   ✅ /api/v1/enrollments
 */
import { axiosInstance } from './axios';
import type {
  Faculty,
  Department,
  Degree,
  Course,
  Specialization,
  Batch,
  BatchTreeNode,
  BatchMember,
  Semester,
  CourseInstance,
  CourseInstructor,
  Enrollment,
  CoursePrerequisite,
  CreateFacultyRequest,
  UpdateFacultyRequest,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  CreateDegreeRequest,
  UpdateDegreeRequest,
  CreateCourseRequest,
  UpdateCourseRequest,
  CreateSpecializationRequest,
  UpdateSpecializationRequest,
  CreateBatchRequest,
  UpdateBatchRequest,
  AddBatchMemberRequest,
  CreateSemesterRequest,
  UpdateSemesterRequest,
  CreateCourseInstanceRequest,
  UpdateCourseInstanceRequest,
  AssignInstructorRequest,
  EnrollStudentRequest,
  UpdateEnrollmentRequest,
  AddPrerequisiteRequest,
} from '@/types/academics.types';

// ── Faculties (super_admin only) ──────────────────────────────────────────────

export const facultiesApi = {
  list: async (includeInactive = false): Promise<Faculty[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    const { data } = await axiosInstance.get('/faculties', { params });
    if (Array.isArray(data)) return data as Faculty[];
    if (Array.isArray(data?.faculties)) return data.faculties as Faculty[];
    return [];
  },

  get: async (id: string): Promise<Faculty> => {
    const { data } = await axiosInstance.get<Faculty>(`/faculties/${id}`);
    return data;
  },

  create: async (req: CreateFacultyRequest): Promise<Faculty> => {
    const { data } = await axiosInstance.post<Faculty>('/faculties', req);
    return data;
  },

  update: async (id: string, req: UpdateFacultyRequest): Promise<Faculty> => {
    const { data } = await axiosInstance.put<Faculty>(`/faculties/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/faculties/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Faculty> => {
    const { data } = await axiosInstance.put<Faculty>(`/faculties/${id}`, {
      is_active: true,
    });
    return data;
  },
};

// ── Departments ───────────────────────────────────────────────────────────────

export const departmentsApi = {
  list: async (includeInactive = false): Promise<Department[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    const { data } = await axiosInstance.get('/departments', { params });
    if (Array.isArray(data)) return data as Department[];
    if (Array.isArray(data?.departments)) return data.departments as Department[];
    return [];
  },

  get: async (id: string): Promise<Department> => {
    const { data } = await axiosInstance.get<Department>(`/departments/${id}`);
    return data;
  },

  create: async (req: CreateDepartmentRequest): Promise<Department> => {
    const { data } = await axiosInstance.post<Department>('/departments', req);
    return data;
  },

  update: async (id: string, req: UpdateDepartmentRequest): Promise<Department> => {
    const { data } = await axiosInstance.put<Department>(`/departments/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/departments/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Department> => {
    const { data } = await axiosInstance.put<Department>(`/departments/${id}`, {
      is_active: true,
    });
    return data;
  },

  listByFaculty: async (facultyId: string): Promise<Department[]> => {
    const { data } = await axiosInstance.get(
      `/faculties/${facultyId}/departments`,
    );
    if (Array.isArray(data)) return data as Department[];
    if (Array.isArray(data?.departments)) return data.departments as Department[];
    return [];
  },
};

// ── Degrees ───────────────────────────────────────────────────────────────────

export const degreesApi = {
  list: async (includeInactive = false): Promise<Degree[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    const { data } = await axiosInstance.get('/degrees', { params });
    if (Array.isArray(data)) return data as Degree[];
    if (Array.isArray(data?.degrees)) return data.degrees as Degree[];
    return [];
  },

  get: async (id: string): Promise<Degree> => {
    const { data } = await axiosInstance.get<Degree>(`/degrees/${id}`);
    return data;
  },

  create: async (req: CreateDegreeRequest): Promise<Degree> => {
    const { data } = await axiosInstance.post<Degree>('/degrees', req);
    return data;
  },

  update: async (id: string, req: UpdateDegreeRequest): Promise<Degree> => {
    const { data } = await axiosInstance.put<Degree>(`/degrees/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/degrees/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Degree> => {
    const { data } = await axiosInstance.put<Degree>(`/degrees/${id}`, {
      is_active: true,
    });
    return data;
  },

  listByDepartment: async (departmentId: string): Promise<Degree[]> => {
    const { data } = await axiosInstance.get(
      `/departments/${departmentId}/degrees`,
    );
    if (Array.isArray(data)) return data as Degree[];
    if (Array.isArray(data?.degrees)) return data.degrees as Degree[];
    return [];
  },
};

// ── Specializations ──────────────────────────────────────────────────────────

export const specializationsApi = {
  listByDegree: async (degreeId: string, includeInactive = false): Promise<Specialization[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    const { data } = await axiosInstance.get(`/degrees/${degreeId}/specializations`, { params });
    if (Array.isArray(data)) return data as Specialization[];
    if (Array.isArray(data?.specializations)) return data.specializations as Specialization[];
    return [];
  },

  get: async (id: string): Promise<Specialization> => {
    const { data } = await axiosInstance.get<Specialization>(`/specializations/${id}`);
    return data;
  },

  create: async (req: CreateSpecializationRequest): Promise<Specialization> => {
    const { data } = await axiosInstance.post<Specialization>('/specializations', req);
    return data;
  },

  update: async (id: string, req: UpdateSpecializationRequest): Promise<Specialization> => {
    const { data } = await axiosInstance.put<Specialization>(`/specializations/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/specializations/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Specialization> => {
    const { data } = await axiosInstance.put<Specialization>(`/specializations/${id}`, {
      is_active: true,
    });
    return data;
  },
};

// ── Courses ───────────────────────────────────────────────────────────────────

export const coursesApi = {
  list: async (includeInactive = false): Promise<Course[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    const { data } = await axiosInstance.get('/courses', { params });
    if (Array.isArray(data)) return data as Course[];
    if (Array.isArray(data?.courses)) return data.courses as Course[];
    return [];
  },

  get: async (id: string): Promise<Course> => {
    const { data } = await axiosInstance.get<Course>(`/courses/${id}`);
    return data;
  },

  create: async (req: CreateCourseRequest): Promise<Course> => {
    const { data } = await axiosInstance.post<Course>('/courses', req);
    return data;
  },

  update: async (id: string, req: UpdateCourseRequest): Promise<Course> => {
    const { data } = await axiosInstance.put<Course>(`/courses/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/courses/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Course> => {
    const { data } = await axiosInstance.put<Course>(`/courses/${id}`, {
      is_active: true,
    });
    return data;
  },

  // ── Prerequisites ─────────────────────────────────────────────────

  listPrerequisites: async (courseId: string): Promise<CoursePrerequisite[]> => {
    const { data } = await axiosInstance.get(`/courses/${courseId}/prerequisites`);
    if (Array.isArray(data)) return data as CoursePrerequisite[];
    if (Array.isArray(data?.prerequisites)) return data.prerequisites as CoursePrerequisite[];
    return [];
  },

  addPrerequisite: async (courseId: string, req: AddPrerequisiteRequest): Promise<CoursePrerequisite> => {
    const { data } = await axiosInstance.post<CoursePrerequisite>(
      `/courses/${courseId}/prerequisites`,
      req,
    );
    return data;
  },

  removePrerequisite: async (courseId: string, prereqCourseId: string): Promise<void> => {
    await axiosInstance.delete(`/courses/${courseId}/prerequisites/${prereqCourseId}`);
  },
};

// ── Semesters ─────────────────────────────────────────────────────────────────

export const semestersApi = {
  list: async (includeInactive = false, termType?: string): Promise<Semester[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    if (termType) params.term_type = termType;
    const { data } = await axiosInstance.get('/semesters', { params });
    if (Array.isArray(data)) return data as Semester[];
    if (Array.isArray(data?.semesters)) return data.semesters as Semester[];
    return [];
  },

  get: async (id: string): Promise<Semester> => {
    const { data } = await axiosInstance.get<Semester>(`/semesters/${id}`);
    return data;
  },

  create: async (req: CreateSemesterRequest): Promise<Semester> => {
    const { data } = await axiosInstance.post<Semester>('/semesters', req);
    return data;
  },

  update: async (id: string, req: UpdateSemesterRequest): Promise<Semester> => {
    const { data } = await axiosInstance.put<Semester>(`/semesters/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/semesters/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Semester> => {
    const { data } = await axiosInstance.put<Semester>(`/semesters/${id}`, {
      is_active: true,
    });
    return data;
  },
};

// ── Batches (Groups) ──────────────────────────────────────────────────────────

export const batchesApi = {
  list: async (includeInactive = false): Promise<Batch[]> => {
    const params: Record<string, unknown> = {};
    if (includeInactive) params.include_inactive = true;
    const { data } = await axiosInstance.get('/batches', { params });
    if (Array.isArray(data)) return data as Batch[];
    if (Array.isArray(data?.batches)) return data.batches as Batch[];
    return [];
  },

  get: async (id: string): Promise<Batch> => {
    const { data } = await axiosInstance.get<Batch>(`/batches/${id}`);
    return data;
  },

  getTree: async (): Promise<BatchTreeNode[]> => {
    const { data } = await axiosInstance.get('/batches/tree');
    if (Array.isArray(data)) return data as BatchTreeNode[];
    if (Array.isArray(data?.tree)) return data.tree as BatchTreeNode[];
    return [];
  },

  getSubtree: async (id: string): Promise<BatchTreeNode> => {
    const { data } = await axiosInstance.get<BatchTreeNode>(`/batches/${id}/tree`);
    return data;
  },

  create: async (req: CreateBatchRequest): Promise<Batch> => {
    const { data } = await axiosInstance.post<Batch>('/batches', req);
    return data;
  },

  update: async (id: string, req: UpdateBatchRequest): Promise<Batch> => {
    const { data } = await axiosInstance.put<Batch>(`/batches/${id}`, req);
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await axiosInstance.patch(`/batches/${id}/deactivate`, { is_active: false });
  },

  reactivate: async (id: string): Promise<Batch> => {
    const { data } = await axiosInstance.put<Batch>(`/batches/${id}`, {
      is_active: true,
    });
    return data;
  },

  getMembers: async (batchId: string): Promise<BatchMember[]> => {
    const { data } = await axiosInstance.get(`/batches/${batchId}/members`);
    if (Array.isArray(data)) return data as BatchMember[];
    if (Array.isArray(data?.members)) return data.members as BatchMember[];
    return [];
  },

  getCourseInstances: async (batchId: string): Promise<CourseInstance[]> => {
    const { data } = await axiosInstance.get(`/batches/${batchId}/course-instances`);
    if (Array.isArray(data)) return data as CourseInstance[];
    if (Array.isArray(data?.course_instances)) return data.course_instances as CourseInstance[];
    return [];
  },
};

// ── Batch Members ─────────────────────────────────────────────────────────────

export const batchMembersApi = {
  add: async (req: AddBatchMemberRequest): Promise<BatchMember> => {
    const { data } = await axiosInstance.post<BatchMember>('/batch-members', req);
    return data;
  },

  remove: async (batchId: string, userId: string): Promise<void> => {
    await axiosInstance.delete(`/batch-members/${batchId}/${userId}`);
  },
};

// ── Course Instances ──────────────────────────────────────────────────────────

export const courseInstancesApi = {
  create: async (req: CreateCourseInstanceRequest): Promise<CourseInstance> => {
    const { data } = await axiosInstance.post<CourseInstance>('/course-instances', req);
    return data;
  },

  update: async (id: string, req: UpdateCourseInstanceRequest): Promise<CourseInstance> => {
    const { data } = await axiosInstance.put<CourseInstance>(`/course-instances/${id}`, req);
    return data;
  },

  getInstructors: async (instanceId: string): Promise<CourseInstructor[]> => {
    const { data } = await axiosInstance.get(`/course-instances/${instanceId}/instructors`);
    if (Array.isArray(data)) return data as CourseInstructor[];
    if (Array.isArray(data?.instructors)) return data.instructors as CourseInstructor[];
    return [];
  },

  getEnrollments: async (instanceId: string): Promise<Enrollment[]> => {
    const { data } = await axiosInstance.get(`/course-instances/${instanceId}/enrollments`);
    if (Array.isArray(data)) return data as Enrollment[];
    if (Array.isArray(data?.enrollments)) return data.enrollments as Enrollment[];
    return [];
  },
};

// ── Course Instructors ────────────────────────────────────────────────────────

export const courseInstructorsApi = {
  assign: async (req: AssignInstructorRequest): Promise<CourseInstructor> => {
    const { data } = await axiosInstance.post<CourseInstructor>('/course-instructors', req);
    return data;
  },

  remove: async (instanceId: string, userId: string): Promise<void> => {
    await axiosInstance.delete(`/course-instructors/${instanceId}/${userId}`);
  },
};

// ── Enrollments ───────────────────────────────────────────────────────────────

export const enrollmentsApi = {
  enroll: async (req: EnrollStudentRequest): Promise<Enrollment> => {
    const { data } = await axiosInstance.post<Enrollment>('/enrollments', req);
    return data;
  },

  update: async (
    instanceId: string,
    userId: string,
    req: UpdateEnrollmentRequest,
  ): Promise<Enrollment> => {
    const { data } = await axiosInstance.put<Enrollment>(
      `/enrollments/${instanceId}/${userId}`,
      req,
    );
    return data;
  },
};
