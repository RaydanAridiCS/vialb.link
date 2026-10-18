import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Rendered per request so the runtime SITE_URL is used (not the build-time one).
export const dynamic = "force-dynamic";

/** Marketing pages only — short links are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/docs/api", "/sign-up", "/sign-in"].map((path) => ({
    url: `${env.SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
