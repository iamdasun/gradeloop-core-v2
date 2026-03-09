/**
 * Assessment service — TypeScript types.
 *
 * These types mirror the backend Go DTOs exactly.
 * Source of truth: apps/services/assessment-service/internal/dto/
 */

// ─── Supporting types for rubric & test cases ─────────────────────────────────

/** A single performance band within a rubric criterion. */
export interface RubricBand {
    level: string;
    description: string;
    min_score: number;
    max_score: number;
}

/** One rubric criterion sent when creating/updating an assignment. */
export interface RubricCriterionDto {
    name: string;
    description?: string;
    /**
     * Evaluation pipeline for this criterion.
     * "deterministic" | "llm" | "llm_ast" (extensible — kept as string).
     */
    grading_mode: string;
    weight: number;  // must sum to 100 across all criteria
    bands?: RubricBand[];
    order_index?: number;
}

/** One test case sent when creating an assignment. */
export interface TestCaseDto {
    description?: string;
    /** stdin passed to Judge0 */
    input: string;
    /** expected stdout from Judge0 */
    expected_output: string;
    is_hidden?: boolean;
    order_index?: number;
}

/** Reference implementation sent when creating an assignment. */
export interface SampleAnswerDto {
    language_id: number;
    language: string;
    code: string;
}


export interface CreateAssignmentRequest {
    course_instance_id: string;
    title: string;
    description: string;
    code: string;
    /** Judge0 language ID chosen by the instructor (e.g. 62 = Java, 71 = Python). */
    language_id?: number;
    release_at?: string | null;
    due_at?: string | null;
    late_due_at?: string | null;
    allow_late_submissions: boolean;
    enforce_time_limit?: number | null;
    allow_group_submission: boolean;
    max_group_size?: number | null;
    enable_ai_assistant?: boolean;
    enable_socratic_feedback?: boolean;
    allow_regenerate?: boolean;
    assessment_type?: "lab" | "exam";
    objective?: string;
    rubric_criteria?: RubricCriterionDto[];
    test_cases?: TestCaseDto[];
    sample_answer?: SampleAnswerDto;
}

export interface AssignmentResponse {
    id: string;
    course_instance_id: string;
    title: string;
    description: string;
    code: string;
    /** Judge0 language ID set by the instructor (e.g. 62 = Java, 71 = Python). */
    language_id: number;
    assessment_type?: string;
    release_at?: string;
    due_at?: string;
    late_due_at?: string;
    allow_late_submissions: boolean;
    enforce_time_limit?: number;
    allow_group_submission: boolean;
    max_group_size: number;
    enable_ai_assistant: boolean;
    enable_socratic_feedback: boolean;
    allow_regenerate: boolean;
    is_active: boolean;
    created_by: string;
    created_at: string;
    updated_at: string;
    total_marks?: number;
    submission_config?: {
        submission_allowed: boolean;
        max_attempts?: number;
    };
    ai_grading_config?: {
        plagiarism_check_enabled: boolean;
    };
}

export interface ListAssignmentsResponse {
    assignments: AssignmentResponse[];
    count: number;
}

export interface SubmissionResponse {
    id: string;
    assignment_id: string;
    user_id?: string;
    group_id?: string;
    storage_path: string;
    language: string;
    status: string;
    /** Human-readable Judge0 execution result, e.g. "Accepted", "Runtime Error (NZEC)", "Compilation Error" */
    execution_status?: string;
    execution_status_id?: number;
    version: number;
    is_latest: boolean;
    judge0_job_id?: string;
    submitted_at: string;
    code?: string;
    // CIPAS analysis results (populated asynchronously via PATCH /submissions/:id/analysis)
    ai_likelihood?: number;
    human_likelihood?: number;
    is_ai_generated?: boolean;
    ai_confidence?: number;
    /** Semantic similarity score vs. instructor sample answer (0–100) */
    semantic_similarity_score?: number;
    analyzed_at?: string;
}

export interface SubmissionCodeResponse {
    submission_id: string;
    assignment_id: string;
    language: string;
    version: number;
    code: string;
}

export interface ListSubmissionsResponse {
    submissions: SubmissionResponse[];
    count: number;
}

// ─── ACAFS grading types ─────────────────────────────────────────────────────

/** Score and justification for a single rubric criterion. */
export interface CriterionScore {
    name: string;
    score: number;
    max_score: number;
    /** deterministic | llm | llm_ast */
    grading_mode: string;
    /** Instructor-facing technical justification — never shown to students. */
    reason: string;
    /** Band chosen during evaluation: excellent | good | satisfactory | unsatisfactory */
    band_selected?: string;
    /** Grading certainty 0.0–1.0. Low values flag items for instructor review. */
    confidence?: number;
    /** Instructor override — stored alongside original; never overwrites AI score. */
    instructor_override_score?: number;
    instructor_override_reason?: string;
}

/** Complete grading result returned by ACAFS GET /api/v1/acafs/grades/:submissionId */
export interface SubmissionGrade {
    submission_id: string;
    assignment_id: string;
    total_score: number;
    max_total_score: number;
    criteria_scores: CriterionScore[];
    holistic_feedback: string;
    graded_at: string;
    grading_metadata?: Record<string, unknown>;
    // Instructor override fields
    instructor_override_score?: number;
    instructor_holistic_feedback?: string;
    override_by?: string;
    overridden_at?: string;
}

/** Payload for PUT /api/acafs/grades/:submissionId/override */
export interface GradeOverrideRequest {
    /** Per-criterion overrides: each item has criterion_name, override_score, override_reason */
    criteria_overrides?: Array<{
        criterion_name: string;
        override_score: number;
        override_reason?: string;
    }>;
    instructor_holistic_feedback?: string;
    /** Instructor user_id or display name recorded for audit. */
    override_by: string;
}

export interface CreateSubmissionRequest {
    assignment_id: string;
    group_id?: string;
    language: string;
    /** Judge0 language ID — required for test-case execution. */
    language_id?: number;
    code: string;
}

/** PATCH /api/v1/submissions/:id/analysis — store CIPAS scores after submission. */
export interface UpdateSubmissionAnalysisRequest {
    ai_likelihood: number;
    human_likelihood: number;
    is_ai_generated: boolean;
    ai_confidence: number;
    semantic_similarity_score?: number | null;
}

/** PUT /api/v1/instructor-assignments/:id/rubric — replace all rubric criteria. */
export interface UpdateRubricRequest {
    criteria: RubricCriterionDto[];
}

/** Response shape from GET/PUT /instructor-assignments/:id/rubric */
export interface ListRubricResponse {
    assignment_id: string;
    criteria: RubricCriterionResponse[];
    total_weight: number;
}

/** One rubric criterion as returned by the API. */
export interface RubricCriterionResponse {
    id: string;
    name: string;
    description?: string;
    grading_mode: string;
    weight: number;
    bands: RubricBand[];
    order_index: number;
}

export interface CreateGroupRequest {
    assignment_id: string;
    members: string[];
}

export interface GroupResponse {
    id: string;
    assignment_id: string;
    members: string[];
    created_at: string;
}

export interface RunCodeRequest {
    assignment_id?: string;
    language_id: number;
    source_code: string;
    stdin?: string;
}

export interface RunCodeResponse {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    /** Human-readable status from Judge0 (e.g. "Accepted", "Runtime Error") */
    status: string;
    status_id: number;
    execution_time: string | null;
    memory_used: number | null;
    message: string | null;
}

// ── ACAFS Socratic Chat types ────────────────────────────────────────────────

export interface AcafsChatMessage {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
}

export interface AcafsChatRequest {
    content: string;
    student_code?: string;
    assignment_title?: string;
    assignment_description?: string;
    rubric_skills?: string[];
}

/** Response from POST /acafs/chat/:assignmentId/:userId */
export interface AcafsChatResponse {
    session_id: string;
    assignment_id: string;
    user_id: string;
    status: 'active' | 'closed';
    reply: string;
    messages: AcafsChatMessage[];
}

/** Response from GET /acafs/chat/:assignmentId/:userId */
export interface AcafsChatHistoryResponse {
    session_id: string;
    assignment_id: string;
    user_id: string;
    status: 'active' | 'closed';
    created_at?: string;
    closed_at?: string;
    closed_reason?: string;
    messages: AcafsChatMessage[];
}
