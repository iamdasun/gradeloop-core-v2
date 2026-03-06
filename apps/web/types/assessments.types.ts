/**
 * Assessment service — TypeScript types.
 *
 * These types mirror the backend Go DTOs exactly.
 * Source of truth: apps/services/assessment-service/internal/dto/
 *
 * Fields marked with TODO [assessment-service] are defined here in the frontend
 * data model but are NOT yet accepted by the backend. They must be added to:
 *   apps/services/assessment-service/internal/dto/assignment.go
 *   apps/services/assessment-service/internal/domain/assignment.go  (model)
 *   apps/services/assessment-service/internal/repository/assignment.go (persistence)
 */

// ─── Supporting types for rubric & test cases ─────────────────────────────────

export interface RubricBandDto {
    description: string;
    mark_range: string; // e.g. "85-100"
}

export interface RubricCriterionDto {
    id: number;
    name: string;
    description: string;
    /** TODO [ACAFS]: grading_mode drives which evaluation pipeline is applied.
     *  - "llm"          → LLM text evaluation only
     *  - "llm_ast"      → LLM + AST structural analysis
     *  - "deterministic" → test-case output matching only
     */
    grading_mode: "deterministic" | "llm" | "llm_ast";
    weight: number; // must sum to 100 across all criteria
    bands: {
        excellent: RubricBandDto;
        good: RubricBandDto;
        satisfactory: RubricBandDto;
        unsatisfactory: RubricBandDto;
    };
}

export interface TestCaseDto {
    test_case_id: number;
    description: string;
    /** stdin passed to Judge0 */
    test_case_input: string;
    /** expected stdout from Judge0 */
    expected_output: string;
}

export interface SampleAnswerDto {
    /** Judge0 language ID */
    language_id: number;
    code: string;
}

// ─── Assignment request / response ────────────────────────────────────────────

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

    // ── TODO [assessment-service]: Fields below are NOT yet stored by the backend.
    // Add the corresponding columns / tables and DTO fields, then remove the
    // comments so the frontend can start sending them.
    //
    // assessment_type?: "lab" | "exam";   // new column: assignments.assessment_type
    // objective?: string;                 // new column: assignments.objective (LLM context)
    // rubric?: { criteria: RubricCriterionDto[] };  // new table: rubric_criteria
    // test_cases?: TestCaseDto[];         // new table: assignment_test_cases
    // sample_answer?: SampleAnswerDto;    // new table/storage: assignment_sample_answers
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
    status: {
        id: number;
        description: string;
    };
    time: string | null;
    memory: number | null;
    exit_code: number | null;
    exit_signal: number | null;
}
