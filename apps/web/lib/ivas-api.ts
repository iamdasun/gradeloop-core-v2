import type {
    IvasAssignment,
    IvasStudent,
    IvasCourse,
    IvasInstructor,
    GradingCriteria,
    GenerateGradingCriteriaRequest,
    GenerateGradingCriteriaResponse,
    UpdateGradingCriteriaRequest,
    IvasQuestion,
    GenerateQuestionsResponse,
    TriggerAssessmentRequest,
    TriggerAssessmentResponse,
    SubmitResponseRequest,
    SubmitResponseResponse,
    SessionDetailsOut,
    AssessmentTranscriptOut,
    StudentSessionSummary,
    InstructorAssessmentSummary,
    ProviderInfo,
    UpdateQuestionRequest,
    DeleteResponse,
    AssignmentMetadata,
    HintRequest,
    HintResponse,
    PauseSessionRequest,
    PauseSessionResponse,
    ResumeSessionRequest,
    ResumeSessionResponse,
    CodeContextUpload,
    CodeContextResponse,
    BulkDeleteCriteriaRequest,
    BulkDeleteResponse,
    BulkUpdateQuestionsRequest,
    BulkUpdateQuestionsResponse,
    StartAssessmentRequest,
    StartAssessmentResponse,
} from "@/types/ivas";

const IVAS_BASE_URL =
    process.env.NEXT_PUBLIC_IVAS_API_URL || "https://ivas.sudila.com";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Retry wrapper for API calls with exponential backoff
async function retryableRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const url = `${IVAS_BASE_URL}${path}`;
            const response = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const error = await response
                    .json()
                    .catch(() => ({ detail: "Unknown error" }));
                throw new Error(error.detail || response.statusText);
            }

            if (response.status === 204) return {} as T;
            return response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Unknown error");

            // Don't retry on client errors (4xx)
            if (lastError.message.includes("4")) {
                throw lastError;
            }

            // Wait before retrying (exponential backoff)
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve =>
                    setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1))
                );
            }
        }
    }

    throw lastError || new Error("Request failed after retries");
}

async function ivasRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    return retryableRequest<T>(path, options);
}

export const ivasApi = {
    // --- Health ---
    checkHealth: () =>
        ivasRequest<{ status: string; database: string; llm_provider: string }>(
            "/health"
        ),
    checkReady: () => ivasRequest<{ ready: boolean }>("/ready"),

    // --- Mock / LMS Data ---
    getAssignments: () =>
        ivasRequest<{ data: IvasAssignment[] }>("/mock/assignments").then(
            (r) => r.data
        ),
    getAssignment: (id: string) =>
        ivasRequest<IvasAssignment>(
            `/mock/assignments/${encodeURIComponent(id)}`
        ),
    getStudents: () =>
        ivasRequest<{ data: IvasStudent[] }>("/mock/students").then((r) => r.data),
    getStudent: (id: string) =>
        ivasRequest<IvasStudent>(`/mock/students/${encodeURIComponent(id)}`),
    getStudentProgress: (id: string) =>
        ivasRequest<unknown>(
            `/mock/students/${encodeURIComponent(id)}/progress`
        ),
    getInstructors: () =>
        ivasRequest<{ data: IvasInstructor[] }>("/mock/instructors").then(
            (r) => r.data
        ),
    getInstructor: (id: string) =>
        ivasRequest<IvasInstructor>(
            `/mock/instructors/${encodeURIComponent(id)}`
        ),
    getCourses: () =>
        ivasRequest<{ data: IvasCourse[] }>("/mock/courses").then((r) => r.data),
    getCourse: (id: string) =>
        ivasRequest<IvasCourse>(`/mock/courses/${encodeURIComponent(id)}`),

    // --- LLM Provider ---
    getProvider: () => ivasRequest<ProviderInfo>("/llm/provider"),
    switchProvider: (provider: string) =>
        ivasRequest<{ message: string; active_provider: string }>(
            "/llm/provider/switch",
            { method: "POST", body: JSON.stringify({ provider }) }
        ),
    getProviderHealth: () =>
        ivasRequest<{ status: string; provider: string; reachable: boolean }>(
            "/llm/provider/health"
        ),

    // --- Grading Criteria (Instructor) ---
    generateCriteria: (
        assignmentId: string,
        data: GenerateGradingCriteriaRequest
    ) =>
        ivasRequest<GenerateGradingCriteriaResponse>(
            `/api/v1/assignments/${encodeURIComponent(
                assignmentId
            )}/grading-criteria/generate`,
            { method: "POST", body: JSON.stringify(data) }
        ),
    getCriteria: (assignmentId: string) =>
        ivasRequest<{ data: GradingCriteria[] }>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/grading-criteria`
        ).then((r) => r.data),
    updateCriteria: (criteriaId: string, data: UpdateGradingCriteriaRequest) =>
        ivasRequest<GradingCriteria>(
            `/api/v1/grading-criteria/${encodeURIComponent(criteriaId)}`,
            { method: "PATCH", body: JSON.stringify(data) }
        ),
    deleteCriteria: (criteriaId: string) =>
        ivasRequest<DeleteResponse>(
            `/api/v1/grading-criteria/${encodeURIComponent(criteriaId)}`,
            { method: "DELETE" }
        ),
    batchDeleteCriteria: (assignmentId: string, criteriaIds: string[]) =>
        ivasRequest<BulkDeleteResponse>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/grading-criteria/batch`,
            {
                method: "DELETE",
                body: JSON.stringify({ criteria_ids: criteriaIds })
            }
        ),

    // --- Questions (Instructor) ---
    generateQuestions: (
        assignmentId: string,
        params?: {
            criteria_id?: string;
            assignment_text?: string;
            num_questions?: number;
        }
    ) => {
        const query = new URLSearchParams();
        if (params?.criteria_id) query.set("criteria_id", params.criteria_id);
        if (params?.assignment_text)
            query.set("assignment_text", params.assignment_text);
        if (params?.num_questions)
            query.set("num_questions", String(params.num_questions));
        const qs = query.toString();
        return ivasRequest<GenerateQuestionsResponse>(
            `/api/v1/assignments/${encodeURIComponent(
                assignmentId
            )}/questions/generate${qs ? `?${qs}` : ""}`,
            { method: "POST" }
        );
    },
    getQuestions: (
        assignmentId: string,
        params?: { status?: string; competency?: string }
    ) => {
        const query = new URLSearchParams();
        if (params?.status) query.set("status", params.status);
        if (params?.competency) query.set("competency", params.competency);
        const qs = query.toString();
        return ivasRequest<{ data: IvasQuestion[] }>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/questions${qs ? `?${qs}` : ""}`
        ).then((r) => r.data);
    },
    getQuestion: (questionId: string) =>
        ivasRequest<IvasQuestion>(
            `/api/v1/questions/${encodeURIComponent(questionId)}`
        ),
    updateQuestion: (questionId: string, data: UpdateQuestionRequest) =>
        ivasRequest<IvasQuestion>(
            `/api/v1/questions/${encodeURIComponent(questionId)}`,
            { method: "PATCH", body: JSON.stringify(data) }
        ),
    deleteQuestion: (questionId: string) =>
        ivasRequest<DeleteResponse>(
            `/api/v1/questions/${encodeURIComponent(questionId)}`,
            { method: "DELETE" }
        ),
    batchUpdateQuestions: (questionIds: string[], updates: UpdateQuestionRequest) =>
        ivasRequest<BulkUpdateQuestionsResponse>(
            `/api/v1/questions/batch`,
            {
                method: "PATCH",
                body: JSON.stringify({ question_ids: questionIds, updates })
            }
        ),
    batchDeleteQuestions: (questionIds: string[]) =>
        ivasRequest<BulkDeleteResponse>(
            `/api/v1/questions/batch`,
            {
                method: "DELETE",
                body: JSON.stringify({ question_ids: questionIds })
            }
        ),

    // --- Assessment Sessions ---
    triggerAssessment: (data: TriggerAssessmentRequest) =>
        ivasRequest<TriggerAssessmentResponse>("/api/v1/assessments/trigger", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    startAssessment: (data: StartAssessmentRequest) =>
        ivasRequest<StartAssessmentResponse>("/api/v1/assessments/start", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    getSession: (sessionId: string) =>
        ivasRequest<SessionDetailsOut>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}`
        ),
    pauseSession: (sessionId: string, reason?: string) =>
        ivasRequest<PauseSessionResponse>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/pause`,
            { method: "PUT", body: JSON.stringify({ session_id: sessionId, reason }) }
        ),
    resumeSession: (sessionId: string) =>
        ivasRequest<ResumeSessionResponse>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/resume`,
            { method: "PUT", body: JSON.stringify({ session_id: sessionId }) }
        ),
    submitResponse: (sessionId: string, data: SubmitResponseRequest) =>
        ivasRequest<SubmitResponseResponse>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/respond`,
            { method: "POST", body: JSON.stringify(data) }
        ),
    requestHint: (sessionId: string, questionInstanceId: string) =>
        ivasRequest<HintResponse>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/hint`,
            { method: "POST", body: JSON.stringify({ session_id: sessionId, question_instance_id: questionInstanceId }) }
        ),
    getTranscript: (sessionId: string) =>
        ivasRequest<AssessmentTranscriptOut>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/transcript`
        ),
    abandonSession: (sessionId: string) =>
        ivasRequest<{ message: string }>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/abandon`,
            { method: "PUT" }
        ),

    // --- Student Portal ---
    getStudentSessions: (studentId: string, status?: string) => {
        const query = status ? `?status=${encodeURIComponent(status)}` : "";
        return ivasRequest<{ data: StudentSessionSummary[]; count: number }>(
            `/api/v1/students/${encodeURIComponent(studentId)}/sessions${query}`
        ).then((r) => r.data);
    },

    // --- Instructor Portal ---
    getInstructorAssessments: (
        instructorId: string,
        params?: {
            assignment_ids?: string;
            assignment_id?: string;
            student_id?: string;
            status?: string;
            start_date?: string;
            end_date?: string;
        }
    ) => {
        const query = new URLSearchParams();
        if (params?.assignment_ids)
            query.set("assignment_ids", params.assignment_ids);
        if (params?.assignment_id)
            query.set("assignment_id", params.assignment_id);
        if (params?.student_id) query.set("student_id", params.student_id);
        if (params?.status) query.set("status", params.status);
        if (params?.start_date) query.set("start_date", params.start_date);
        if (params?.end_date) query.set("end_date", params.end_date);
        const qs = query.toString();
        return ivasRequest<{
            data: InstructorAssessmentSummary[];
            count: number;
        }>(
            `/api/v1/instructors/${encodeURIComponent(
                instructorId
            )}/assessments${qs ? `?${qs}` : ""}`
        ).then((r) => r.data);
    },

    // --- Assignment Metadata ---
    saveAssignmentMetadata: (assignmentId: string, data: { assignment_text: string }) =>
        ivasRequest<AssignmentMetadata>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/metadata`,
            { method: "POST", body: JSON.stringify(data) }
        ),
    getAssignmentMetadata: (assignmentId: string) =>
        ivasRequest<AssignmentMetadata>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/metadata`
        ),

    // --- Code Context ---
    uploadCodeContext: (assignmentId: string, code: string, language?: string, fileName?: string) =>
        ivasRequest<CodeContextResponse>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/code-context`,
            {
                method: "POST",
                body: JSON.stringify({
                    assignment_id: assignmentId,
                    code,
                    language,
                    file_name: fileName
                })
            }
        ),
    getCodeContext: (assignmentId: string) =>
        ivasRequest<{ code_context: string; language: string }>(
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/code-context`
        ),
};
