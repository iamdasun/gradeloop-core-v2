/**
 * Assessment service — TypeScript types.
 *
 * These types mirror the backend Go DTOs exactly.
 * Source of truth: apps/services/assessment-service/internal/dto/
 */

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
}

export interface AssignmentResponse {
    id: string;
    course_instance_id: string;
    title: string;
    description: string;
    code: string;
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
