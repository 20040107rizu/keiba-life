import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
 output: 'export',
 images: { unoptimized: true },
 trailingSlash: false,
 experimental: { cpus: 2 },
};

export default nextConfig;
