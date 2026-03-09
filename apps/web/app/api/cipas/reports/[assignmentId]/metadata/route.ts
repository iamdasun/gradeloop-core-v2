import { NextRequest, NextResponse } from "next/server";

const CIPAS_SYNTACTICS_URL = `${process.env.NEXT_PUBLIC_API_URL}/syntactics`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const { assignmentId } = await params;
    
    const upstream = await fetch(
      `${CIPAS_SYNTACTICS_URL}/reports/${assignmentId}/metadata`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (upstream.status === 404) {
      return NextResponse.json(
        { detail: "Similarity report not found" },
        { status: 404 }
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 }
    );
  }
}
