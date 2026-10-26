import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosting first: produces .next/standalone with a minimal server.js.
  output: "standalone",
  // Cache Components is intentionally OFF. Every page is rendered per request
  // so the proxy can inject a fresh CSP nonce (see src/proxy.ts and
  // docs/architecture.md#rendering-model).
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: [
    "@node-rs/argon2",
    "@maxmind/geoip2-node",
    "ioredis",
    "pino",
    "pino-pretty",
    "sharp",
  ],
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
