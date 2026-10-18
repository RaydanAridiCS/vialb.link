export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Record<UtmKey, string | null>;

const MAX_PARAM_LENGTH = 200;

/** UTM values from the short-link request's own query string. */
export function extractUtm(params: URLSearchParams): UtmParams {
  const read = (key: UtmKey) => {
    const value = params.get(key)?.trim();
    return value ? value.slice(0, MAX_PARAM_LENGTH) : null;
  };
  return {
    utm_source: read("utm_source"),
    utm_medium: read("utm_medium"),
    utm_campaign: read("utm_campaign"),
    utm_term: read("utm_term"),
    utm_content: read("utm_content"),
  };
}

/**
 * Appends the short link's query parameters to the destination. Parameters
 * already present on the destination are kept and the incoming value is
 * appended after them (destination order is preserved). Fragments survive.
 */
export function forwardQuery(destination: string, incoming: URLSearchParams): string {
  if ([...incoming.keys()].length === 0) return destination;
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  for (const [key, value] of incoming) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}
