import type { NextConfig } from "next";

// The CommandBoard API (boards, tasks, plugins, /health) runs as its own
// service. In the old custom server.js it was mounted in-process; here we proxy
// those paths to it via rewrites. Our own /api routes (hire-us, oauth/coinpay,
// webhooks) are filesystem routes and match before these afterFiles rewrites.
const commandboardApiUrl = process.env.COMMANDBOARD_API_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!commandboardApiUrl) return [];
    const base = commandboardApiUrl.replace(/\/$/, "");
    return {
      afterFiles: [
        { source: "/health", destination: `${base}/health` },
        { source: "/api/:path*", destination: `${base}/api/:path*` }
      ]
    };
  }
};

export default nextConfig;
