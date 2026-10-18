import type { GeoInfo, GeoLookupInput, GeoResolver } from "@/server/ports/geo-resolver";
import { UNKNOWN_GEO } from "@/server/ports/geo-resolver";
import { logger } from "@/lib/logger";

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && decoded.length <= 100 ? decoded : null;
  } catch {
    return null;
  }
}

function country(value: string | null): string | null {
  const code = value?.trim().toUpperCase();
  // "XX" / "T1" are Cloudflare's unknown / Tor markers.
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
}

/**
 * Reads geo headers injected by a trusted CDN / edge (Cloudflare, Vercel,
 * Fastly-style). Only enabled with TRUST_PROXY_GEO_HEADERS=true because the
 * headers are trivially spoofable when no such proxy is in front.
 */
export class HeaderGeoResolver implements GeoResolver {
  async resolve({ headers }: GeoLookupInput): Promise<GeoInfo> {
    return {
      country: country(
        headers.get("cf-ipcountry") ??
          headers.get("x-vercel-ip-country") ??
          headers.get("x-country-code") ??
          headers.get("cloudfront-viewer-country"),
      ),
      region: decode(
        headers.get("cf-region") ??
          headers.get("x-vercel-ip-country-region") ??
          headers.get("cloudfront-viewer-country-region-name"),
      ),
      city: decode(
        headers.get("cf-ipcity") ?? headers.get("x-vercel-ip-city") ?? headers.get("cloudfront-viewer-city"),
      ),
    };
  }
}

interface MaxMindReader {
  city(ip: string): {
    country?: { isoCode?: string };
    subdivisions?: { names?: { en?: string } }[];
    city?: { names?: { en?: string } };
  };
  country(ip: string): { country?: { isoCode?: string } };
}

/** Local MaxMind GeoLite2 lookups (City or Country database). */
export class MaxMindGeoResolver implements GeoResolver {
  private reader: Promise<MaxMindReader | null> | null = null;

  constructor(private readonly dbPath: string) {}

  private load(): Promise<MaxMindReader | null> {
    this.reader ??= import("@maxmind/geoip2-node")
      .then(({ Reader }) => Reader.open(this.dbPath) as Promise<unknown> as Promise<MaxMindReader>)
      .catch((error: unknown) => {
        logger.error({ err: error, path: this.dbPath }, "Failed to open GeoLite2 database; geo disabled");
        return null;
      });
    return this.reader;
  }

  async resolve({ ip }: GeoLookupInput): Promise<GeoInfo> {
    if (!ip) return UNKNOWN_GEO;
    const reader = await this.load();
    if (!reader) return UNKNOWN_GEO;
    try {
      const result = reader.city(ip);
      return {
        country: country(result.country?.isoCode ?? null),
        region: result.subdivisions?.[0]?.names?.en ?? null,
        city: result.city?.names?.en ?? null,
      };
    } catch {
      try {
        return { country: country(reader.country(ip).country?.isoCode ?? null), region: null, city: null };
      } catch {
        return UNKNOWN_GEO; // private / unknown address
      }
    }
  }
}

/** Tries each resolver in order and returns the first one that yields a country. */
export class ChainGeoResolver implements GeoResolver {
  constructor(private readonly resolvers: readonly GeoResolver[]) {}

  async resolve(input: GeoLookupInput): Promise<GeoInfo> {
    for (const resolver of this.resolvers) {
      const result = await resolver.resolve(input);
      if (result.country) return result;
    }
    return UNKNOWN_GEO;
  }
}
