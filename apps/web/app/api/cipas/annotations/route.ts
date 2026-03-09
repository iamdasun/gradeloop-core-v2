import { NextRequest, NextResponse } from "next/server";

const CIPAS_SYNTACTICS_URL = `${process.env.NEXT_PUBLIC_API_URL}/syntactics`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const upstream = await fetch(`${CIPAS_SYNTACTICS_URL}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 }
    );
  }
}
