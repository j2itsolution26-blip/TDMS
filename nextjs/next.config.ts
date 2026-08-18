import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Laravel app's package-lock.json lives one directory up; without
  // this, Next infers that as the workspace root and misresolves paths.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
