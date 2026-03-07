// ============================================================
// Mock / LMS Types
// ============================================================

export interface DifficultyRange {
    min: number;
    max: number;
}

export interface IvasAssignment {
    assignment_id: string;
    instructor_id: string;
    course_id: string;
    title: string;
    competencies: string[];
    learning_objectives: string[];
    difficulty_range: DifficultyRange;
}

export interface IvasStudent {
    id: string;
    name: string;
    course_id: string;
}

export interface IvasCourse {
    id: string;
    name: string;
    programming_language: string;
}

export interface IvasInstructor {
    id: string;
    name: string;
    email: string;
}

// ============================================================
// Grading Criteria
// ============================================================

export interface GradingCriteria {
    id: string;
    assignment_id: string;
    competency: string;
    difficulty_level: number;
    level_label: string;
    level_description: string;
    marking_criteria: string;
    programming_language: string;
    learning_objectives: string[];
    created_at: string;
    updated_at: string;
}

export interface GenerateGradingCriteriaRequest {
    assignment_text: string;
    replace_existing?: boolean;
    num_criteria?: number; // 2-10
}

export interface GenerateGradingCriteriaResponse {
    assignment_id: string;
    criteria_ids: string[];
    total_generated: number;
}

export interface UpdateGradingCriteriaRequest {
    competency?: string;
    difficulty_level?: number; // 1-5
    level_label?: string;
    level_description?: string;
    marking_criteria?: string;
    programming_language?: string;
    learning_objectives?: string[];
}

// ============================================================
// Questions
// ============================================================

export interface IvasQuestion {
    id: string;
    assignment_id: string;
    criteria_id: string;
    question_text: string;
    expected_answer: string;
    competency: string;
    difficulty: number;
    max_points: number;
    status: string; // "draft" | "approved"
}

export interface GenerateQuestionsResponse {
    assignment_id: string;
    question_ids: string[];
    total_generated: number;
}

// ============================================================
// Assessment Session
// ============================================================

export interface QuestionWithContext {
    question_id: string;
    question_instance_id: string;
    question_text: string;
    competency: string;
    difficulty: number;
    code_context: string;
    hint: string;
    is_follow_up: boolean;
    question_type: "new" | "follow_up" | "re_ask";
}

export interface TriggerAssessmentRequest {
    student_id: string;
    assignment_id: string;
    code_context?: string;
}

export interface TriggerAssessmentResponse {
    session_id: string;
    first_question: QuestionWithContext | null;
    total_questions: number;
    status: string;
}

export interface SubmitResponseRequest {
    question_instance_id: string;
    response_text: string;
    response_type?: string;
}

export interface CompetencySummary {
    competency: string;
    score: number;
    max_score: number;
    questions_asked: number;
}

export interface SubmitResponseResponse {
    response_id: string;
    next_question: QuestionWithContext | null;
    is_complete: boolean;
    message: string;
    evaluation_score: number | null;
    feedback_text: string | null;
    detected_misconceptions: string[] | null;
    final_score: number | null;
    max_score: number | null;
    competency_summary: CompetencySummary[] | null;
}

// ============================================================
// Session Details
// ============================================================

export interface QuestionInstanceOut {
    id: string;
    session_id: string;
    question_id: string;
    sequence_number: number;
    asked_at: string;
    competency: string;
    difficulty: number;
    follow_up_depth: number;
    parent_instance_id: string | null;
    follow_up_question_text: string | null;
}

export interface StudentResponseOut {
    id: string;
    question_instance_id: string;
    session_id: string;
    student_id: string;
    response_text: string;
    response_type: string | null;
    submitted_at: string;
    response_time_seconds: number;
    evaluation_score: number | null;
    feedback_text: string | null;
    detected_misconceptions: string[] | null;
    input_classification: string | null; // "evaluate"|"teach_and_skip"|"explain_and_reask"|"clarify_relevance"|"warn_and_reask"
    score_justification: string | null;
    voice_intent: string | null;
}

export interface SessionOut {
    id: string;
    student_id: string;
    assignment_id: string;
    status: "in_progress" | "completed" | "abandoned";
    trigger_reason: string;
    started_at: string;
    completed_at: string | null;
    code_context: string | null;
    final_score: number | null;
    max_score: number | null;
    competency_summary: CompetencySummary[] | null;
}

export interface SessionDetailsOut {
    session: SessionOut;
    questions_asked: QuestionInstanceOut[];
    responses: StudentResponseOut[];
    total_questions: number;
    answered_questions: number;
}

// ============================================================
// Student & Instructor Summaries
// ============================================================

export interface StudentSessionSummary {
    session_id: string;
    assignment_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    questions_asked: number;
    responses_given: number;
}

export interface InstructorAssessmentSummary {
    session_id: string;
    student_id: string;
    assignment_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    questions_asked: number;
    responses_given: number;
}

// ============================================================
// Transcript
// ============================================================

export interface ExchangeOut {
    question_text: string;
    competency: string;
    difficulty: number;
    student_answer: string;
    asked_at: string;
    answered_at: string | null;
    response_time_seconds: number;
    evaluation_score: number | null;
    feedback_text: string | null;
    detected_misconceptions: string[] | null;
    score_justification: string | null;
    voice_intent: string | null;
    is_follow_up: boolean;
    question_type: "new" | "follow_up" | "re_ask";
}

export interface AssessmentTranscriptOut {
    session_id: string;
    student_id: string;
    assignment_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    code_context: string;
    exchanges: ExchangeOut[];
    final_score: number | null;
    max_score: number | null;
    competency_summary: CompetencySummary[] | null;
}

// ============================================================
// LLM Provider
// ============================================================

export interface ProviderInfo {
    active_provider: string;
    provider_display: string;
    supported_providers: string[];
}

// ============================================================
// Chat Message (UI-only)
// ============================================================

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    metadata?: {
        score?: number;
        competency?: string;
        difficulty?: number;
        questionType?: "new" | "follow_up" | "re_ask";
        isFeedback?: boolean;
        misconceptions?: string[];
    };
}

// ============================================================
// Question Management
// ============================================================

export interface UpdateQuestionRequest {
    question_text?: string;
    expected_answer?: string;
    competency?: string;
    difficulty?: number;
    max_points?: number;
    status?: "draft" | "approved" | "rejected";
    criteria_id?: string;
}

export interface DeleteResponse {
    message: string;
    deleted_id: string;
}

// ============================================================
// Assignment Metadata
// ============================================================

export interface AssignmentMetadata {
    assignment_id: string;
    assignment_text: string;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Hint System
// ============================================================

export interface HintRequest {
    session_id: string;
    question_instance_id: string;
}

export interface HintResponse {
    hint_id: string;
    question_instance_id: string;
    hint_text: string;
    penalty_applied: number;
    total_hints_used: number;
}

// ============================================================
// Session Pause/Resume
// ============================================================

export interface PauseSessionRequest {
    session_id: string;
    reason?: string;
}

export interface PauseSessionResponse {
    session_id: string;
    status: "paused";
    paused_at: string;
    message: string;
}

export interface ResumeSessionRequest {
    session_id: string;
}

export interface ResumeSessionResponse {
    session_id: string;
    status: "in_progress";
    resumed_at: string;
    current_question: QuestionWithContext | null;
    message: string;
}

// ============================================================
// Code Context
// ============================================================

export interface CodeContextUpload {
    assignment_id: string;
    code: string;
    language?: string;
    file_name?: string;
}

export interface CodeContextResponse {
    assignment_id: string;
    code_context_id: string;
    message: string;
}

// ============================================================
// Bulk Operations
// ============================================================

export interface BulkDeleteCriteriaRequest {
    criteria_ids: string[];
}

export interface BulkDeleteResponse {
    deleted_count: number;
    deleted_ids: string[];
    message: string;
}

export interface BulkUpdateQuestionsRequest {
    question_ids: string[];
    updates: UpdateQuestionRequest;
}

export interface BulkUpdateQuestionsResponse {
    updated_count: number;
    updated_ids: string[];
    message: string;
}

// ============================================================
// Assessment Start
// ============================================================

export interface StartAssessmentRequest {
    student_id: string;
    assignment_id: string;
    code_context?: string;
}

export interface StartAssessmentResponse {
    session_id: string;
    first_question: QuestionWithContext | null;
    total_questions: number;
    status: string;
    message: string;
}
