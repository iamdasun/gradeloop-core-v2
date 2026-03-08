// TypeScript types for the CIPAS Syntactics Service
// Matches the Pydantic schemas in cipas-syntactics/schemas.py

export interface SubmissionItem {
  submission_id: string;
  student_id: string;
  source_code: string;
}

export interface AssignmentClusterRequest {
  assignment_id: string;
  language: string;
  submissions: SubmissionItem[];
  instructor_template?: string;
  lsh_threshold?: number;   // default 0.3
  min_confidence?: number;  // default 0.0
}

export interface CollusionEdge {
  student_a: string;
  student_b: string;
  clone_type: string;        // "Type-1" | "Type-2" | "Type-3"
  confidence: number;        // 0.0 – 1.0
  match_count: number;
}

export interface CollusionGroup {
  group_id: number;
  member_ids: string[];      // submission_ids
  member_count: number;
  max_confidence: number;
  dominant_type: string;
  edge_count: number;
  edges: CollusionEdge[];
}

export interface SubmissionClusterResult {
  submission_id: string;
  student_id: string;
  fragment_count: number;
  candidate_pair_count: number;
  confirmed_clone_count: number;
  errors: string[];
}

export interface AssignmentClusterResponse {
  assignment_id: string;
  language: string;
  submission_count: number;
  processed_count: number;
  failed_count: number;
  total_clone_pairs: number;
  collusion_groups: CollusionGroup[];
  per_submission: SubmissionClusterResult[];
}

// ──────────────────────────────────────────────────────────────────────────
// Instructor Annotations
// ──────────────────────────────────────────────────────────────────────────

export type AnnotationStatus =
  | "pending_review"
  | "confirmed_plagiarism"
  | "false_positive"
  | "acceptable_collaboration"
  | "requires_investigation";

export interface CreateAnnotationRequest {
  assignment_id: string;
  instructor_id: string;
  status: AnnotationStatus;
  match_id?: string;
  group_id?: string;
  comments?: string;
  action_taken?: string;
}

export interface UpdateAnnotationRequest {
  status?: AnnotationStatus;
  comments?: string;
  action_taken?: string;
}

export interface AnnotationResponse {
  id: string;
  assignment_id: string;
  instructor_id: string;
  status: AnnotationStatus;
  match_id?: string;
  group_id?: string;
  comments?: string;
  action_taken?: string;
  created_at: string;  // ISO timestamp
  updated_at: string;  // ISO timestamp
}

export interface AnnotationStatsResponse {
  assignment_id: string;
  total: number;
  pending_review: number;
  confirmed_plagiarism: number;
  false_positive: number;
  acceptable_collaboration: number;
  requires_investigation: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Similarity Report Metadata
// ──────────────────────────────────────────────────────────────────────────

export interface SimilarityReportMetadata {
  id: string;
  assignment_id: string;
  language: string;
  submission_count: number;
  processed_count: number;
  failed_count: number;
  total_clone_pairs: number;
  lsh_threshold: number;
  min_confidence: number;
  processing_time_seconds?: number;
  created_at: string;  // ISO timestamp
  updated_at: string;  // ISO timestamp
}
