import { NextRequest, NextResponse } from "next/server";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://traefik:8000/api/v1"
).replace(/\/+$/, "");

async function parseUpstream(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/**
 * PUT /api/acafs/grades/[submissionId]/override
 *
 * Server-side proxy → ACAFS PUT /api/v1/acafs/grades/:submissionId/override
 * Applies instructor score/feedback overrides alongside the AI-generated grade.
 * Original ACAFS scores are never mutated — overrides sit in separate columns.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;

  try {
    const body = await req.json();
    const upstream = await fetch(
      `${API_BASE}/acafs/grades/${encodeURIComponent(submissionId)}/override`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );
    const data = await parseUpstream(upstream);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { detail: "Grade override service unavailable" },
      { status: 503 }
    );
  }
}
