import { NextRequest, NextResponse } from "next/server";

const CIPAS_SYNTACTICS_URL =
  process.env.CIPAS_SYNTACTICS_URL ||
  "http://localhost:8086/api/v1/syntactics";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ annotationId: string }> }
) {
  try {
    const { annotationId } = await params;
    const body = await req.json();
    
    const upstream = await fetch(
      `${CIPAS_SYNTACTICS_URL}/annotations/${annotationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
