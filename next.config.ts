import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker image: self-contained server (Vercel builds ignore this).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
