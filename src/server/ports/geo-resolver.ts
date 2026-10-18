export interface GeoInfo {
  /** ISO-3166 alpha-2, upper case. */
  country: string | null;
  region: string | null;
  city: string | null;
}

export interface GeoLookupInput {
  ip: string | null;
  headers: Headers;
}

/** Resolves location locally (CDN headers / GeoLite2). Never calls third-party HTTP APIs. */
export interface GeoResolver {
  resolve(input: GeoLookupInput): Promise<GeoInfo>;
}

export const UNKNOWN_GEO: GeoInfo = { country: null, region: null, city: null };
