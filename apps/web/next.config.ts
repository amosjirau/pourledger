import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  serverExternalPackages: ["ssh2"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
