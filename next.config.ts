import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    reactStrictMode: true,
    experimental: {
        // parallelServerBuildTraces: true,
        // parallelServerCompiles: true,
        dynamicIO: true,
    },
};

export default nextConfig;
