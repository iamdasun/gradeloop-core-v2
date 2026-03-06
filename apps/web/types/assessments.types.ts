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
    release_at?: string | null;
    due_at?: string | null;
    late_due_at?: string | null;
    allow_late_submissions: boolean;
    enforce_time_limit?: number | null;
    allow_group_submission: boolean;
    max_group_size?: number | null;
    enable_ai_assistant: boolean;
    enable_socratic_feedback: boolean;
    allow_regenerate: boolean;
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
    version: number;
    is_latest: boolean;
    judge0_job_id?: string;
    submitted_at: string;
    code?: string;
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

export interface CreateSubmissionRequest {
    assignment_id: string;
    group_id?: string;
    language: string;
    code: string;
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
