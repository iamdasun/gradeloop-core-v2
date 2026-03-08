import { NextRequest, NextResponse } from "next/server";

const CIPAS_SYNTACTICS_URL =
  process.env.CIPAS_SYNTACTICS_URL ||
  "http://localhost:8086/api/v1/syntactics";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const { assignmentId } = await params;

    const upstream = await fetch(
      `${CIPAS_SYNTACTICS_URL}/annotations/assignment/${assignmentId}/stats`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 }
    );
  }
}
