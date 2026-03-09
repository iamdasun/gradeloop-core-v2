import { NextRequest, NextResponse } from "next/server";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://traefik:8000/api/v1"
).replace(/\/+$/, "");

/** Safely parse an upstream response body as JSON, falling back to plain text. */
async function parseUpstream(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/**
 * GET /api/acafs/grades/[submissionId]
 *
 * Server-side proxy → ACAFS GET /api/v1/acafs/grades/:submissionId
 * Returns 404 while grading is still in progress (ACAFS behaviour).
 * Returns 200 + SubmissionGrade JSON when grading is complete.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;

  try {
    const upstream = await fetch(
      `${API_BASE}/acafs/grades/${encodeURIComponent(submissionId)}`,
      { cache: "no-store" }
    );
    const body = await parseUpstream(upstream);
    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { detail: "Grade service unavailable" },
      { status: 503 }
    );
  }
}
