import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (node .next/standalone/server.js): runs in the staging container on Azure Container Apps.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // xr-spatial-tracking: Android "View in AR" (WebXR immersive-ar) on our own pages only. Camera stays off for page scripts (WebXR does not need it).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), xr-spatial-tracking=(self)" },
          // Short while HTTPS/domain setup is proven on staging; raise to a year (and consider includeSubDomains) at launch.
          { key: "Strict-Transport-Security", value: "max-age=86400" },
        ],
      },
      // Generic AR models (no personal data). USDZ needs its registered type for iOS; neither file type is in the default static MIME map.
      { source: "/ar/:file*.usdz", headers: [{ key: "Content-Type", value: "model/vnd.usdz+zip" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
      { source: "/ar/:file*.glb", headers: [{ key: "Content-Type", value: "model/gltf-binary" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
