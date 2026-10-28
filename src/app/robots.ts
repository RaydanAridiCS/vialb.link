import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Rendered per request so the runtime SITE_URL is used (not the build-time one).
export const dynamic = "force-dynamic";

/**
 * Marketing pages and bio pages (`/@handle`) are indexable; everything else (short links live at the
 * root, so they're blocked by default and re-allowed for "/" only) is not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/$", "/docs/api$", "/sign-in$", "/sign-up$", "/@"],
        disallow: ["/", "/stats/"],
      },
    ],
    sitemap: `${env.SITE_URL}/sitemap.xml`,
  };
}
