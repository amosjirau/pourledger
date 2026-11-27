import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  serverExternalPackages: ["ssh2","pdfkit"],
  outputFileTracingIncludes: { "/construction/reports/download": ["./professional/fonts/DejaVuSans.ttf"] },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
