import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Monorepo: keep tracing rooted at this app so the repo-root Vite lockfile is ignored.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
