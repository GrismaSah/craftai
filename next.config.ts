import type { NextConfig } from "next";
import path from "node:path";

// The project lives inside a OneDrive-synced folder, and an unrelated
// package-lock.json up the tree (C:\Users\<user>\package-lock.json) makes
// Next.js misdetect the workspace root. Pin it explicitly so dev/build stop
// warning and Turbopack/webpack trace only this project's files.
const projectRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },

  images:{
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
        port: "",
        pathname: "/images/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
