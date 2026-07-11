import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-63b82db147424dc4b6616e833a203d40.r2.dev",
      },
    ],
  },
};

export default nextConfig;
