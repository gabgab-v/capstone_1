import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add this headers block to configure CORS
  async headers() {
    return [
      {
        // This applies to all routes in your API
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          // Replace * with your frontend's URL in production for better security
          // e.g., "http://localhost:5173" for Vite's default dev server
          { key: "Access-Control-Allow-Origin", value: "*" }, 
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
