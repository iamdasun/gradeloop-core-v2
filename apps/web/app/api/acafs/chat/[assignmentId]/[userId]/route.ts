import { NextRequest, NextResponse } from "next/server";

// Reuse the same API base URL used everywhere else in the app.
// NEXT_PUBLIC_API_URL = http://traefik:8000/api/v1
const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://traefik:8000/api/v1"
).replace(/\/+$/, "");

type Params = { assignmentId: string; userId: string };

async function parseUpstream(
  res: Response,
): Promise<{ data: unknown; status: number }> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { data: await res.json(), status: res.status };
  }
  const text = await res.text();
  return { data: { detail: text || res.statusText }, status: res.status };
}

/** GET /api/acafs/chat/[assignmentId]/[userId]  → load session history */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { assignmentId, userId } = await params;
  try {
    const upstream = await fetch(
      `${API_BASE}/acafs/chat/${encodeURIComponent(assignmentId)}/${encodeURIComponent(userId)}`,
      { cache: "no-store" },
    );
    const { data, status } = await parseUpstream(upstream);
    return NextResponse.json(data, { status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 },
    );
  }
}

/** POST /api/acafs/chat/[assignmentId]/[userId]  → send a student message */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { assignmentId, userId } = await params;
  try {
    const body = await req.json();
    const upstream = await fetch(
      `${API_BASE}/acafs/chat/${encodeURIComponent(assignmentId)}/${encodeURIComponent(userId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const { data, status } = await parseUpstream(upstream);
    return NextResponse.json(data, { status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 },
    );
  }
}
