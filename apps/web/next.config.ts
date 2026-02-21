import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No rewrites needed - API calls go directly to backend at localhost:8000
  // This allows proper cookie handling for authentication
};

export default nextConfig;
