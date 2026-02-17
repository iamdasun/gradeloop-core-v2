import { NextResponse } from "next/server";

// Use server-side IAM_SERVICE_URL for Docker internal network communication
// Falls back to NEXT_PUBLIC_IAM_SERVICE_URL for local dev, then localhost
const IAM_SERVICE_URL =
  process.env.IAM_SERVICE_URL || 
  process.env.NEXT_PUBLIC_IAM_SERVICE_URL || 
  "http://localhost:8080";
// Don't append /v1 here - it's part of the incoming path
const API_BASE = IAM_SERVICE_URL;

async function proxy(req: Request, path: string) {
  // Forward the path as-is to the IAM service, adding /api prefix
  const cleanPath = path;
  const url = `${API_BASE}/api/${cleanPath}`;

  // 1. Check if we are in development mode
  const isDev = process.env.NODE_ENV === "development";


  
  console.log("[PROXY] Incoming path:", path);
  console.log("[PROXY] Clean path:", cleanPath);
  console.log("[PROXY] API_BASE:", API_BASE);
  console.log("[PROXY] Final URL:", url);

  // Build headers for outgoing request
  const outHeaders: Record<string, string> = {};
  for (const [k, v] of req.headers) {
    // Do not forward host header
    if (k.toLowerCase() === "host") continue;

    // Remove AUTH FOR DEV:::: Skip auth headers if DISABLE_AUTH is set
    if (process.env.DISABLE_AUTH === "true" && (k.toLowerCase() === "cookie" || k.toLowerCase() === "authorization")) continue;


    outHeaders[k] = v;
  }

  // Forward cookies from incoming request (important for HTTPOnly auth cookies)
  // const cookie = req.headers.get("cookie");
  // if (cookie) outHeaders["cookie"] = cookie;

  // Remove AUTH FOR DEV::::Only forward cookies manually if auth is NOT disabled
  const cookie = req.headers.get("cookie");
  if (cookie && process.env.DISABLE_AUTH !== "true") outHeaders["cookie"] = cookie;

  const init = {
    method: req.method,
    headers: outHeaders,
    // Forward body if present
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "manual",
    // Required when sending a body with fetch
    duplex: req.method !== "GET" && req.method !== "HEAD" ? "half" : undefined,
  } as RequestInit & { duplex?: string };

  console.log("[PROXY] Making request to:", url);
  console.log("[PROXY] Request method:", req.method);
  console.log("[PROXY] Request headers:", Object.keys(outHeaders));
  
  const res = await fetch(url, init);
  
  console.log("[PROXY] Response status:", res.status);
  console.log("[PROXY] Response headers:", [...res.headers.entries()]);

  // Clone response headers but remove hop-by-hop headers
  const headers = new Headers(res.headers);
  headers.delete("transfer-encoding");

  // Return proxied response with same status and body
  const body = await res.arrayBuffer();
  return new NextResponse(Buffer.from(body), {
    status: res.status,
    headers,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = (resolvedParams.path || []).join("/") || "";
  return proxy(request, path);
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = (resolvedParams.path || []).join("/") || "";
  return proxy(request, path);
}

export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = (resolvedParams.path || []).join("/") || "";
  return proxy(request, path);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = (resolvedParams.path || []).join("/") || "";
  return proxy(request, path);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = (resolvedParams.path || []).join("/") || "";
  return proxy(request, path);
}

export async function OPTIONS() {
  // Let browser know this endpoint supports CORS preflight when proxied
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
