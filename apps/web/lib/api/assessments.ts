import { axiosInstance } from './axios';
import type {
    AssignmentResponse,
    ListAssignmentsResponse,
    CreateAssignmentRequest,
    SampleAnswerDto,
    SubmissionResponse,
    ListSubmissionsResponse,
    SubmissionCodeResponse,
    CreateSubmissionRequest,
    UpdateSubmissionAnalysisRequest,
    GroupResponse,
    CreateGroupRequest,
    RunCodeRequest,
    RunCodeResponse,
    SubmissionGrade,
    GradeOverrideRequest,
    UpdateRubricRequest,
    ListRubricResponse,
    AcafsChatRequest,
    AcafsChatResponse,
    AcafsChatHistoryResponse,
} from '@/types/assessments.types';

// ── Instructor-scoped Assessment endpoints ───────────────────────────────────

export const instructorAssessmentsApi = {
    /**
     * List assignments created by the instructor.
     * Optionally filter by course_instance_id.
     * Backend: GET /instructor-assignments/me?course_instance_id=:id (optional)
     */
    listMyAssignments: async (courseInstanceId?: string): Promise<AssignmentResponse[]> => {
        const params = courseInstanceId ? { course_instance_id: courseInstanceId } : {};
        const { data } = await axiosInstance.get<ListAssignmentsResponse>(
            '/instructor-assignments/me',
            { params }
        );
        return data.assignments || [];
    },

    createAssignment: async (req: CreateAssignmentRequest): Promise<AssignmentResponse> => {
        const { data } = await axiosInstance.post<AssignmentResponse>('/instructor-assignments', req);
        return data;
    },

    listSubmissions: async (assignmentId: string): Promise<SubmissionResponse[]> => {
        const { data } = await axiosInstance.get<ListSubmissionsResponse>(`/instructor-submissions/assignment/${assignmentId}`);
        return data.submissions || [];
    },

    /**
     * Get full submission metadata (including CIPAS analysis fields) for a specific submission.
     * Backend: GET /submissions/:id
     */
    getSubmission: async (submissionId: string): Promise<SubmissionResponse> => {
        const { data } = await axiosInstance.get<SubmissionResponse>(`/submissions/${submissionId}`);
        return data;
    },

    getRubric: async (assignmentId: string): Promise<ListRubricResponse> => {
        const { data } = await axiosInstance.get<ListRubricResponse>(`/instructor-assignments/${assignmentId}/rubric`);
        return data;
    },

    updateRubric: async (assignmentId: string, req: UpdateRubricRequest): Promise<ListRubricResponse> => {
        const { data } = await axiosInstance.put<ListRubricResponse>(`/instructor-assignments/${assignmentId}/rubric`, req);
        return data;
    },
};

// ── General Assessment endpoints ─────────────────────────────────────────────

export const assessmentsApi = {
    getAssignment: async (id: string): Promise<AssignmentResponse> => {
        const { data } = await axiosInstance.get<AssignmentResponse>(`/assignments/${id}`);
        return data;
    },

    updateAssignment: async (id: string, req: Partial<CreateAssignmentRequest>): Promise<AssignmentResponse> => {
        const { data } = await axiosInstance.patch<AssignmentResponse>(`/assignments/${id}`, req);
        return data;
    },

    submitAssignment: async (req: CreateSubmissionRequest): Promise<SubmissionResponse> => {
        const { data } = await axiosInstance.post<SubmissionResponse>('/submissions', req);
        return data;
    },

    getSubmissionCode: async (id: string): Promise<SubmissionCodeResponse> => {
        const { data } = await axiosInstance.get<SubmissionCodeResponse>(`/submissions/${id}/code`);
        return data;
    },

    /**
     * Persist CIPAS analysis scores on a submission (fire-and-forget).
     * Backend: PATCH /submissions/:id/analysis
     */
    updateSubmissionAnalysis: async (id: string, req: UpdateSubmissionAnalysisRequest): Promise<void> => {
        await axiosInstance.patch(`/submissions/${id}/analysis`, req);
    },

    createGroup: async (req: CreateGroupRequest): Promise<GroupResponse> => {
        const { data } = await axiosInstance.post<GroupResponse>('/groups', req);
        return data;
    },

    runCode: async (req: RunCodeRequest): Promise<RunCodeResponse> => {
        const { data } = await axiosInstance.post<RunCodeResponse>('/submissions/run-code', req);
        return data;
    },
};

// ── Student-scoped Assessment endpoints ─────────────────────────────────────

export const studentAssessmentsApi = {
    /**
     * List all assignments for a given course instance.
     * Backend: GET /student-assignments?course_instance_id=:id
     */
    listAssignmentsForCourse: async (courseInstanceId: string): Promise<AssignmentResponse[]> => {
        const { data } = await axiosInstance.get<ListAssignmentsResponse>('/student-assignments', {
            params: { course_instance_id: courseInstanceId },
        });
        return data.assignments || (Array.isArray(data) ? data : []);
    },

    /**
     * Get a single assignment by ID.
     * Backend: GET /student-assignments/:id
     */
    getAssignment: async (id: string): Promise<AssignmentResponse> => {
        const { data } = await axiosInstance.get<AssignmentResponse>(`/student-assignments/${id}`);
        return data;
    },

    /**
     * List the calling student's submissions for a given assignment (all versions).
     * Backend: GET /student-submissions/me?assignment_id=:id
     */
    listMySubmissions: async (assignmentId: string): Promise<SubmissionResponse[]> => {
        const { data } = await axiosInstance.get<ListSubmissionsResponse>('/student-submissions/me', {
            params: { assignment_id: assignmentId },
        });
        return data.submissions || (Array.isArray(data) ? data : []);
    },

    /**
     * Get the latest submission (including draft/in-progress code) for an assignment.
     * Backend: GET /student-submissions/me/latest?assignment_id=:id
     */
    getMyLatestSubmission: async (assignmentId: string): Promise<SubmissionResponse | null> => {
        try {
            const { data } = await axiosInstance.get<SubmissionResponse>(
                '/student-submissions/me/latest',
                { params: { assignment_id: assignmentId } },
            );
            return data;
        } catch {
            return null;
        }
    },

    /**
     * Get the source code of a specific submission version.
     * Backend: GET /submissions/:id/code
     */
    getSubmissionCode: async (submissionId: string): Promise<SubmissionCodeResponse> => {
        const { data } = await axiosInstance.get<SubmissionCodeResponse>(`/submissions/${submissionId}/code`);
        return data;
    },

    /**
     * Get full submission metadata (including CIPAS analysis fields) for a specific submission.
     * Backend: GET /submissions/:id
     */
    getSubmission: async (submissionId: string): Promise<SubmissionResponse> => {
        const { data } = await axiosInstance.get<SubmissionResponse>(`/submissions/${submissionId}`);
        return data;
    },

    /**
     * Fetch the sample answer for an assignment (used for semantic similarity after submission).
     * Returns null if no sample answer is configured or on error.
     * Backend: GET /student-assignments/:id/sample-answer
     */
    getAssignmentSampleAnswer: async (assignmentId: string): Promise<SampleAnswerDto | null> => {
        try {
            const { data } = await axiosInstance.get<SampleAnswerDto>(
                `/student-assignments/${assignmentId}/sample-answer`,
            );
            return data;
        } catch {
            return null;
        }
    },

    /**
     * Submit (or resubmit) an assignment. Each call creates a new version.
     * Backend: POST /submissions
     */
    submit: async (req: CreateSubmissionRequest): Promise<SubmissionResponse> => {
        const { data } = await axiosInstance.post<SubmissionResponse>('/submissions', req);
        return data;
    },

    /**
     * Run code against Judge0 without creating a formal submission.
     * Backend: POST /submissions/run-code
     */
    runCode: async (req: RunCodeRequest): Promise<RunCodeResponse> => {
        const { data } = await axiosInstance.post<RunCodeResponse>('/submissions/run-code', req);
        return data;
    },
};

// ── ACAFS service endpoints (via API gateway) ────────────────────────────────

export const acafsApi = {
    /**
     * Fetch the AI-generated grade for a submission.
     * Direct: GET /acafs/grades/:submissionId via Traefik gateway.
     *
     * Throws an error with message "GRADING_PENDING" when grading hasn't
     * completed yet (ACAFS returns 404). Callers should poll with back-off.
     */
    getSubmissionGrade: async (submissionId: string): Promise<SubmissionGrade> => {
        try {
            const { data } = await axiosInstance.get<SubmissionGrade>(
                `/acafs/grades/${submissionId}`,
            );
            return data;
        } catch (err: any) {
            if (err?.response?.status === 404) throw new Error('GRADING_PENDING');
            throw err;
        }
    },

    /**
     * Apply instructor overrides to an existing grade.
     * Direct: PUT /acafs/grades/:submissionId/override via Traefik gateway.
     *
     * Original ACAFS scores are never mutated — overrides are stored separately.
     */
    overrideGrade: async (
        submissionId: string,
        body: GradeOverrideRequest,
    ): Promise<SubmissionGrade> => {
        try {
            const { data } = await axiosInstance.put<SubmissionGrade>(
                `/acafs/grades/${submissionId}/override`,
                body,
            );
            return data;
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            throw new Error(
                detail ?? `Override failed with status ${err?.response?.status ?? 'unknown'}`,
            );
        }
    },

    /**
     * Retrieve the Socratic chat session history for a student + assignment.
     * Direct: GET /acafs/chat/:assignmentId/:userId via Traefik gateway.
     */
    getChatHistory: async (
        assignmentId: string,
        userId: string,
    ): Promise<AcafsChatHistoryResponse> => {
        const { data } = await axiosInstance.get<AcafsChatHistoryResponse>(
            `/acafs/chat/${assignmentId}/${userId}`,
        );
        return data;
    },

    /**
     * Send a student message to the Socratic tutor.
     * Direct: POST /acafs/chat/:assignmentId/:userId via Traefik gateway.
     */
    sendChatMessage: async (
        assignmentId: string,
        userId: string,
        body: AcafsChatRequest,
    ): Promise<AcafsChatResponse> => {
        const { data } = await axiosInstance.post<AcafsChatResponse>(
            `/acafs/chat/${assignmentId}/${userId}`,
            body,
        );
        return data;
    },
};
