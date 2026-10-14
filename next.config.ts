import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Listing photos (lib/listings/images.ts). Resized and re-encoded so a search page does not
    // download 24 full-size originals (brief §10.4).
    remotePatterns: [
      { protocol: "https", hostname: "hostaway-platform.s3.us-west-2.amazonaws.com", pathname: "/listing/**" },
    ],
  },
};

export default nextConfig;
