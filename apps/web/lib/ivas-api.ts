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
} from "@/types/ivas";

const IVAS_BASE_URL =
    process.env.NEXT_PUBLIC_IVAS_API_URL || "https://ivas.sudila.com";

async function ivasRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
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
            `/api/v1/assignments/${encodeURIComponent(assignmentId)}/questions${qs ? `?${qs}` : ""
            }`
        ).then((r) => r.data);
    },

    // --- Assessment Sessions ---
    triggerAssessment: (data: TriggerAssessmentRequest) =>
        ivasRequest<TriggerAssessmentResponse>("/api/v1/assessments/trigger", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    getSession: (sessionId: string) =>
        ivasRequest<SessionDetailsOut>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}`
        ),
    submitResponse: (sessionId: string, data: SubmitResponseRequest) =>
        ivasRequest<SubmitResponseResponse>(
            `/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/respond`,
            { method: "POST", body: JSON.stringify(data) }
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
};
