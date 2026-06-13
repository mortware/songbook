import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (Azure Container Apps)
  output: "standalone",
};

export default nextConfig;
