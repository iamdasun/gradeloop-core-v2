import type {
  AssignmentClusterRequest,
  AssignmentClusterResponse,
} from "@/types/cipas";

// Requests go to the Next.js proxy route — no CORS issues.
const CLUSTER_ENDPOINT = "/api/cipas/assignments/cluster";

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
