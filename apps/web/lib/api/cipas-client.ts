import type {
  AssignmentClusterRequest,
  AssignmentClusterResponse,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  AnnotationResponse,
  AnnotationStatsResponse,
  SimilarityReportMetadata,
} from "@/types/cipas";

// Requests go to the Next.js proxy route — no CORS issues.
const CLUSTER_ENDPOINT = "/api/cipas/assignments/cluster";
const REPORTS_ENDPOINT = "/api/cipas/reports";
const ANNOTATIONS_ENDPOINT = "/api/cipas/annotations";

/**
 * Cluster all submissions for an assignment.
 * This runs the full CIPAS syntactic analysis pipeline.
 */
export async function clusterAssignment(
  request: AssignmentClusterRequest
): Promise<AssignmentClusterResponse> {
  const res = await fetch(CLUSTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `CIPAS request failed [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<AssignmentClusterResponse>;
}

/**
 * Get a cached similarity report for an assignment.
 * Returns null if no report exists.
 */
export async function getSimilarityReport(
  assignmentId: string
): Promise<AssignmentClusterResponse | null> {
  const res = await fetch(`${REPORTS_ENDPOINT}/${assignmentId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 404) {
    return null; // No cached report
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch similarity report [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<AssignmentClusterResponse>;
}

/**
 * Get metadata about a cached similarity report.
 */
export async function getSimilarityReportMetadata(
  assignmentId: string
): Promise<SimilarityReportMetadata | null> {
  const res = await fetch(`${REPORTS_ENDPOINT}/${assignmentId}/metadata`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch report metadata [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<SimilarityReportMetadata>;
}

/**
 * Create a new instructor annotation for a clone match or group.
 */
export async function createAnnotation(
  request: CreateAnnotationRequest
): Promise<AnnotationResponse> {
  const res = await fetch(ANNOTATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to create annotation [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<AnnotationResponse>;
}

/**
 * Update an existing instructor annotation.
 */
export async function updateAnnotation(
  annotationId: string,
  request: UpdateAnnotationRequest
): Promise<AnnotationResponse> {
  const res = await fetch(`${ANNOTATIONS_ENDPOINT}/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to update annotation [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<AnnotationResponse>;
}

/**
 * Get all annotations for an assignment.
 */
export async function getAnnotations(
  assignmentId: string,
  status?: string
): Promise<AnnotationResponse[]> {
  const url = new URL(
    `${ANNOTATIONS_ENDPOINT}/assignment/${assignmentId}`,
    window.location.origin
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
      `Failed to fetch annotations [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<AnnotationResponse[]>;
}

/**
 * Get annotation statistics for an assignment.
 */
export async function getAnnotationStats(
  assignmentId: string
): Promise<AnnotationStatsResponse> {
  const res = await fetch(
    `${ANNOTATIONS_ENDPOINT}/assignment/${assignmentId}/stats`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to fetch annotation stats [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.json() as Promise<AnnotationStatsResponse>;
}

/**
 * Export a similarity report in the specified format.
 */
export async function exportSimilarityReport(
  assignmentId: string,
  format: "pdf" | "csv" = "pdf"
): Promise<Blob> {
  const res = await fetch(
    `${REPORTS_ENDPOINT}/${assignmentId}/export?format=${format}`,
    {
      method: "GET",
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to export report [${res.status}]: ${detail || res.statusText}`
    );
  }

  return res.blob();
}
