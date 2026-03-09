import type {
  AssignmentClusterRequest,
  AssignmentClusterResponse,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  AnnotationResponse,
  AnnotationStatsResponse,
  SimilarityReportMetadata,
  AIDetectionRequest,
  AIDetectionResponse,
} from "@/types/cipas";
import type { UpdateSubmissionAnalysisRequest } from "@/types/assessments.types";
import { axiosInstance } from "@/lib/api/axios";

// Re-export for consumers that previously imported SubmissionAnalysis from here.
export type { UpdateSubmissionAnalysisRequest as SubmissionAnalysis };

// Gateway prefixes - all calls go through the Traefik gateway at NEXT_PUBLIC_API_URL.
// No Next.js proxy routes needed; CORS is handled by Traefik middleware on each service.
const SYNTACTICS = "/syntactics";
const AI = "/ai";
const SEMANTICS = "/semantics";

export async function clusterAssignment(
  request: AssignmentClusterRequest,
): Promise<AssignmentClusterResponse> {
  const { data } = await axiosInstance.post<AssignmentClusterResponse>(
    `${SYNTACTICS}/assignments/cluster`,
    request,
  );
  return data;
}

export async function getSimilarityReport(
  assignmentId: string,
): Promise<AssignmentClusterResponse | null> {
  try {
    const { data } = await axiosInstance.get<AssignmentClusterResponse>(
      `${SYNTACTICS}/reports/${assignmentId}`,
    );
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || (status !== undefined && status >= 500)) return null;
    throw err;
  }
}

export async function getSimilarityReportMetadata(
  assignmentId: string,
): Promise<SimilarityReportMetadata | null> {
  try {
    const { data } = await axiosInstance.get<SimilarityReportMetadata>(
      `${SYNTACTICS}/reports/${assignmentId}/metadata`,
    );
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || (status !== undefined && status >= 500)) return null;
    throw err;
  }
}

export async function createAnnotation(
  request: CreateAnnotationRequest,
): Promise<AnnotationResponse> {
  const { data } = await axiosInstance.post<AnnotationResponse>(
    `${SYNTACTICS}/annotations`,
    request,
  );
  return data;
}

export async function updateAnnotation(
  annotationId: string,
  request: UpdateAnnotationRequest,
): Promise<AnnotationResponse> {
  const { data } = await axiosInstance.patch<AnnotationResponse>(
    `${SYNTACTICS}/annotations/${annotationId}`,
    request,
  );
  return data;
}

export async function getAnnotations(
  assignmentId: string,
  status?: string,
): Promise<AnnotationResponse[]> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const { data } = await axiosInstance.get<AnnotationResponse[]>(
    `${SYNTACTICS}/annotations/assignment/${assignmentId}`,
    { params },
  );
  return data;
}

export async function getAnnotationStats(
  assignmentId: string,
): Promise<AnnotationStatsResponse> {
  const { data } = await axiosInstance.get<AnnotationStatsResponse>(
    `${SYNTACTICS}/annotations/assignment/${assignmentId}/stats`,
  );
  return data;
}

export async function exportSimilarityReport(
  assignmentId: string,
  _format: "pdf" | "csv" = "csv",
): Promise<Blob> {
  const { data } = await axiosInstance.get<Blob>(
    `${SYNTACTICS}/reports/${assignmentId}/export.csv`,
    { responseType: "blob" },
  );
  return data;
}

export async function detectAICode(code: string): Promise<AIDetectionResponse> {
  const { data } = await axiosInstance.post<AIDetectionResponse>(
    `${AI}/detect`,
    { code } as AIDetectionRequest,
  );
  return data;
}

export async function detectAICodeBatch(
  submissions: Array<{ submission_id: string; source_code: string }>,
): Promise<Record<string, AIDetectionResponse>> {
  const results: Record<string, AIDetectionResponse> = {};
  await Promise.all(
    submissions.map(async (sub) => {
      try {
        results[sub.submission_id] = await detectAICode(sub.source_code);
      } catch (error) {
        console.error(`AI detection failed for ${sub.submission_id}:`, error);
      }
    }),
  );
  return results;
}

export async function getSemanticSimilarity(
  code1: string,
  code2: string,
): Promise<number | null> {
  if (!code1.trim() || !code2.trim()) return null;
  try {
    const { data } = await axiosInstance.post<{ similarity_score: number }>(
      `${SEMANTICS}/similarity`,
      { code1, code2 },
    );
    return Math.round(data.similarity_score * 100);
  } catch {
    return null;
  }
}

export async function saveSubmissionAnalysis(
  submissionId: string,
  analysis: UpdateSubmissionAnalysisRequest,
): Promise<void> {
  try {
    await axiosInstance.patch(`/submissions/${submissionId}/analysis`, analysis);
  } catch {
    // Fire-and-forget - failure to persist must not block the submit flow.
  }
}
