import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  async rewrites() {
    return [
      { source: "/api/chat", destination: "http://localhost:4000/api/chat" },
      { source: "/api/session", destination: "http://localhost:4000/api/session" },
      { source: "/api/messages", destination: "http://localhost:4000/api/messages" },
    ];
  },
};

export default nextConfig;
