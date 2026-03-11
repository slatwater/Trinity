import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["electron"],
  async rewrites() {
    return [
      { source: "/api/chat", destination: "http://localhost:4000/api/chat" },
      { source: "/api/session", destination: "http://localhost:4000/api/session" },
      { source: "/api/messages", destination: "http://localhost:4000/api/messages" },
      { source: "/api/workflows", destination: "http://localhost:4000/api/workflows" },
      { source: "/api/autopilot/:id/message", destination: "http://localhost:4000/api/autopilot/:id/message" },
      { source: "/api/autopilot/:id/confirm", destination: "http://localhost:4000/api/autopilot/:id/confirm" },
      { source: "/api/autopilot/:id", destination: "http://localhost:4000/api/autopilot/:id" },
      { source: "/api/autopilot", destination: "http://localhost:4000/api/autopilot" },
    ];
  },
};

export default nextConfig;
