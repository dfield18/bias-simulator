import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "dividedview.com" }],
        destination: "https://www.dividedview.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
