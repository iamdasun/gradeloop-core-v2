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

// Requests go to the Next.js proxy route — no CORS issues.
const CLUSTER_ENDPOINT = "/api/cipas/assignments/cluster";
const REPORTS_ENDPOINT = "/api/cipas/reports";
const ANNOTATIONS_ENDPOINT = "/api/cipas/annotations";
const AI_DETECT_ENDPOINT = "/api/v1/ai/detect";

/**
 * Cluster all submissions for an assignment.
 * This runs the full CIPAS syntactic analysis pipeline.
 */
export async function clusterAssignment(
  request: AssignmentClusterRequest,
): Promise<AssignmentClusterResponse> {
  const res = await fetch(CLUSTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `CIPAS request failed [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AssignmentClusterResponse>;
}

/**
 * Get a cached similarity report for an assignment.
 * Returns null if no report exists.
 */
export async function getSimilarityReport(
  assignmentId: string,
): Promise<AssignmentClusterResponse | null> {
  const res = await fetch(`${REPORTS_ENDPOINT}/${assignmentId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 404 || res.status >= 500) {
    return null; // No cached report, or persistence layer unavailable
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch similarity report [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AssignmentClusterResponse>;
}

/**
 * Get metadata about a cached similarity report.
 */
export async function getSimilarityReportMetadata(
  assignmentId: string,
): Promise<SimilarityReportMetadata | null> {
  const res = await fetch(`${REPORTS_ENDPOINT}/${assignmentId}/metadata`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 404 || res.status >= 500) {
    return null; // No cached metadata, or persistence layer unavailable
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch report metadata [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<SimilarityReportMetadata>;
}

/**
 * Create a new instructor annotation for a clone match or group.
 */
export async function createAnnotation(
  request: CreateAnnotationRequest,
): Promise<AnnotationResponse> {
  const res = await fetch(ANNOTATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to create annotation [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AnnotationResponse>;
}

/**
 * Update an existing instructor annotation.
 */
export async function updateAnnotation(
  annotationId: string,
  request: UpdateAnnotationRequest,
): Promise<AnnotationResponse> {
  const res = await fetch(`${ANNOTATIONS_ENDPOINT}/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to update annotation [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AnnotationResponse>;
}

/**
 * Get all annotations for an assignment.
 */
export async function getAnnotations(
  assignmentId: string,
  status?: string,
): Promise<AnnotationResponse[]> {
  const url = new URL(
    `${ANNOTATIONS_ENDPOINT}/assignment/${assignmentId}`,
    window.location.origin,
  );

  if (status) {
    url.searchParams.set("status", status);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch annotations [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AnnotationResponse[]>;
}

/**
 * Get annotation statistics for an assignment.
 */
export async function getAnnotationStats(
  assignmentId: string,
): Promise<AnnotationStatsResponse> {
  const res = await fetch(
    `${ANNOTATIONS_ENDPOINT}/assignment/${assignmentId}/stats`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch annotation stats [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AnnotationStatsResponse>;
}

/**
 * Export a similarity report in the specified format.
 */
export async function exportSimilarityReport(
  assignmentId: string,
  format: "pdf" | "csv" = "pdf",
): Promise<Blob> {
  const res = await fetch(
    `${REPORTS_ENDPOINT}/${assignmentId}/export?format=${format}`,
    {
      method: "GET",
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to export report [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.blob();
}

/**
 * Detect AI-generated code likelihood.
 */
export async function detectAICode(code: string): Promise<AIDetectionResponse> {
  const res = await fetch(AI_DETECT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code } as AIDetectionRequest),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `AI detection failed [${res.status}]: ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<AIDetectionResponse>;
}

/**
 * Batch detect AI likelihood for multiple submissions.
 * Returns a map of submission_id to AI detection result.
 */
export async function detectAICodeBatch(
  submissions: Array<{ submission_id: string; source_code: string }>,
): Promise<Record<string, AIDetectionResponse>> {
  const results: Record<string, AIDetectionResponse> = {};

  await Promise.all(
    submissions.map(async (sub) => {
      try {
        const result = await detectAICode(sub.source_code);
        results[sub.submission_id] = result;
      } catch (error) {
        console.error(`AI detection failed for ${sub.submission_id}:`, error);
      }
    }),
  );

  return results;
}
