/**
 * Sample traffic profiles for the public demo. Pure data plus a seeded sampler,
 * so the same module powers the server-rendered report and the client live feed.
 */

export type ScenarioId = "launch" | "podcast" | "menu";

export interface Weighted<T> {
  value: T;
  weight: number;
}

/** A weighted list with at least one entry, so a pick always has a result. */
export type WeightedList<T> = [Weighted<T>, ...Weighted<T>[]];

export interface DeviceProfile {
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
}

export interface LocationProfile {
  country: string;
  cities: WeightedList<string>;
}

export interface UtmProfile {
  source: string;
  medium: string;
  campaign: string;
}

export interface DemoScenario {
  id: ScenarioId;
  title: string;
  code: string;
  destination: string;
  /** One line describing who uses the link and where it was shared. */
  story: string;
  /** Average human clicks per day before the shape multiplier. */
  dailyBase: number;
  /** Traffic multiplier for a day, given how many days ago it was. */
  shape: (daysAgo: number, weekday: number) => number;
  /** Relative weight of each UTC hour. */
  hourly: number[];
  /** Relative weight of each UTC weekday, Sunday first. */
  weekday: number[];
  locations: WeightedList<LocationProfile>;
  devices: WeightedList<DeviceProfile>;
  referrers: WeightedList<string | null>;
  utm: WeightedList<UtmProfile | null>;
  languages: WeightedList<string>;
  botShare: number;
}

const city = (value: string, weight: number): Weighted<string> => ({ value, weight });

const LAUNCH: DemoScenario = {
  id: "launch",
  title: "Product launch",
  code: "launch",
  destination: "https://acme.dev/blog/introducing-acme-2",
  story: "A two-person startup posts its launch on Hacker News, X and its newsletter.",
  dailyBase: 70,
  shape: (daysAgo) => {
    // Quiet teaser traffic, then the launch spike 9 days ago with a long tail and a newsletter bump.
    if (daysAgo > 9) return 0.18;
    const sinceLaunch = 9 - daysAgo;
    const spike = 7 * Math.exp(-sinceLaunch / 1.6);
    const newsletter = daysAgo <= 3 && daysAgo > 1 ? 1.4 : 0;
    return 0.9 + spike + newsletter;
  },
  hourly: [3, 2, 2, 1, 1, 1, 2, 3, 5, 7, 8, 9, 10, 12, 15, 16, 16, 15, 13, 11, 9, 7, 5, 4],
  weekday: [0.6, 1.1, 1.2, 1.15, 1.1, 1, 0.65],
  locations: [
    {
      value: {
        country: "US",
        cities: [
          city("San Francisco", 4),
          city("New York", 4),
          city("Seattle", 2),
          city("Austin", 2),
          city("Chicago", 1),
        ],
      },
      weight: 34,
    },
    {
      value: { country: "DE", cities: [city("Berlin", 4), city("Munich", 2), city("Hamburg", 1)] },
      weight: 9,
    },
    {
      value: { country: "GB", cities: [city("London", 5), city("Manchester", 1), city("Edinburgh", 1)] },
      weight: 8,
    },
    {
      value: { country: "IN", cities: [city("Bengaluru", 4), city("Pune", 1), city("Hyderabad", 1)] },
      weight: 7,
    },
    {
      value: { country: "CA", cities: [city("Toronto", 3), city("Vancouver", 2), city("Montreal", 1)] },
      weight: 5,
    },
    { value: { country: "FR", cities: [city("Paris", 4), city("Lyon", 1)] }, weight: 5 },
    { value: { country: "NL", cities: [city("Amsterdam", 3), city("Utrecht", 1)] }, weight: 4 },
    { value: { country: "BR", cities: [city("São Paulo", 3), city("Florianópolis", 1)] }, weight: 3 },
    { value: { country: "JP", cities: [city("Tokyo", 3), city("Osaka", 1)] }, weight: 3 },
    { value: { country: "AU", cities: [city("Sydney", 2), city("Melbourne", 2)] }, weight: 3 },
    { value: { country: "SE", cities: [city("Stockholm", 1)] }, weight: 2 },
    { value: { country: "PL", cities: [city("Warsaw", 2), city("Kraków", 1)] }, weight: 2 },
  ],
  devices: [
    { value: { deviceType: "desktop", browser: "Chrome", os: "macOS" }, weight: 30 },
    { value: { deviceType: "desktop", browser: "Chrome", os: "Windows" }, weight: 14 },
    { value: { deviceType: "desktop", browser: "Safari", os: "macOS" }, weight: 12 },
    { value: { deviceType: "desktop", browser: "Firefox", os: "Linux" }, weight: 8 },
    { value: { deviceType: "desktop", browser: "Edge", os: "Windows" }, weight: 5 },
    { value: { deviceType: "mobile", browser: "Mobile Safari", os: "iOS" }, weight: 16 },
    { value: { deviceType: "mobile", browser: "Chrome", os: "Android" }, weight: 12 },
    { value: { deviceType: "tablet", browser: "Mobile Safari", os: "iOS" }, weight: 3 },
  ],
  referrers: [
    { value: "news.ycombinator.com", weight: 30 },
    { value: null, weight: 18 },
    { value: "x.com", weight: 14 },
    { value: "www.linkedin.com", weight: 9 },
    { value: "www.reddit.com", weight: 8 },
    { value: "github.com", weight: 7 },
    { value: "www.producthunt.com", weight: 6 },
    { value: "buttondown.email", weight: 4 },
    { value: "www.google.com", weight: 4 },
  ],
  utm: [
    { value: null, weight: 40 },
    { value: { source: "hackernews", medium: "social", campaign: "launch" }, weight: 25 },
    { value: { source: "twitter", medium: "social", campaign: "launch" }, weight: 15 },
    { value: { source: "newsletter", medium: "email", campaign: "launch-week" }, weight: 12 },
    { value: { source: "linkedin", medium: "social", campaign: "launch" }, weight: 8 },
  ],
  languages: [
    { value: "en", weight: 62 },
    { value: "de", weight: 9 },
    { value: "fr", weight: 6 },
    { value: "es", weight: 5 },
    { value: "pt", weight: 4 },
    { value: "ja", weight: 3 },
    { value: "nl", weight: 3 },
    { value: "pl", weight: 2 },
  ],
  botShare: 0.05,
};

const PODCAST: DemoScenario = {
  id: "podcast",
  title: "Podcast show notes",
  code: "ep43",
  destination: "https://fieldnotes.fm/episodes/43-the-quiet-web",
  story: "A weekly podcast links its sponsor and reading list from every episode description.",
  dailyBase: 95,
  shape: (daysAgo, weekday) => {
    // New episode every Tuesday, a slow upward trend as the show grows.
    const trend = 0.75 + ((90 - Math.min(daysAgo, 180)) / 90) * 0.35;
    const release = weekday === 2 ? 2.4 : weekday === 3 ? 1.6 : weekday === 4 ? 1.15 : 0.8;
    return trend * release;
  },
  hourly: [2, 1, 1, 1, 2, 4, 8, 12, 11, 7, 6, 6, 8, 7, 6, 6, 8, 11, 10, 8, 7, 6, 5, 3],
  weekday: [0.85, 0.95, 1.1, 1.05, 1, 1, 0.9],
  locations: [
    {
      value: {
        country: "US",
        cities: [
          city("New York", 3),
          city("Los Angeles", 2),
          city("Chicago", 2),
          city("Denver", 1),
          city("Portland", 1),
        ],
      },
      weight: 40,
    },
    {
      value: { country: "GB", cities: [city("London", 4), city("Bristol", 1), city("Leeds", 1)] },
      weight: 14,
    },
    { value: { country: "CA", cities: [city("Toronto", 3), city("Vancouver", 2)] }, weight: 9 },
    {
      value: { country: "AU", cities: [city("Melbourne", 2), city("Sydney", 2), city("Brisbane", 1)] },
      weight: 8,
    },
    { value: { country: "DE", cities: [city("Berlin", 2), city("Cologne", 1)] }, weight: 6 },
    { value: { country: "IE", cities: [city("Dublin", 3), city("Cork", 1)] }, weight: 4 },
    { value: { country: "NZ", cities: [city("Auckland", 2), city("Wellington", 1)] }, weight: 3 },
    { value: { country: "NL", cities: [city("Amsterdam", 1)] }, weight: 3 },
    { value: { country: "ZA", cities: [city("Cape Town", 1)] }, weight: 2 },
  ],
  devices: [
    { value: { deviceType: "mobile", browser: "Mobile Safari", os: "iOS" }, weight: 46 },
    { value: { deviceType: "mobile", browser: "Chrome", os: "Android" }, weight: 24 },
    { value: { deviceType: "desktop", browser: "Chrome", os: "macOS" }, weight: 12 },
    { value: { deviceType: "desktop", browser: "Chrome", os: "Windows" }, weight: 10 },
    { value: { deviceType: "tablet", browser: "Mobile Safari", os: "iOS" }, weight: 8 },
  ],
  referrers: [
    { value: "open.spotify.com", weight: 28 },
    { value: "podcasts.apple.com", weight: 22 },
    { value: null, weight: 20 },
    { value: "www.youtube.com", weight: 10 },
    { value: "overcast.fm", weight: 6 },
    { value: "www.instagram.com", weight: 6 },
    { value: "pca.st", weight: 4 },
    { value: "x.com", weight: 4 },
  ],
  utm: [
    { value: null, weight: 50 },
    { value: { source: "show-notes", medium: "podcast", campaign: "ep-43" }, weight: 20 },
    { value: { source: "show-notes", medium: "podcast", campaign: "ep-42" }, weight: 15 },
    { value: { source: "show-notes", medium: "podcast", campaign: "ep-41" }, weight: 10 },
    { value: { source: "instagram", medium: "social", campaign: "clips" }, weight: 5 },
  ],
  languages: [
    { value: "en", weight: 88 },
    { value: "de", weight: 5 },
    { value: "nl", weight: 3 },
    { value: "es", weight: 2 },
    { value: "fr", weight: 2 },
  ],
  botShare: 0.03,
};

const MENU: DemoScenario = {
  id: "menu",
  title: "Restaurant QR menu",
  code: "menu",
  destination: "https://tasca-do-rio.pt/menu",
  story: "A Lisbon restaurant prints one QR code on every table card and the front window.",
  dailyBase: 85,
  shape: (daysAgo, weekday) => {
    const weekend = weekday === 5 || weekday === 6 ? 1.45 : weekday === 1 ? 0 : 1;
    const summer = 0.9 + ((90 - Math.min(daysAgo, 180)) / 90) * 0.15;
    return weekend * summer;
  },
  hourly: [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 6, 14, 16, 9, 3, 2, 4, 10, 18, 20, 15, 8, 3],
  weekday: [1, 1, 1, 1, 1, 1, 1],
  locations: [
    {
      value: {
        country: "PT",
        cities: [city("Lisbon", 20), city("Almada", 2), city("Cascais", 2), city("Sintra", 1)],
      },
      weight: 78,
    },
    { value: { country: "ES", cities: [city("Madrid", 2), city("Seville", 1)] }, weight: 6 },
    { value: { country: "FR", cities: [city("Paris", 2), city("Bordeaux", 1)] }, weight: 5 },
    { value: { country: "GB", cities: [city("London", 2)] }, weight: 4 },
    { value: { country: "DE", cities: [city("Berlin", 1), city("Munich", 1)] }, weight: 3 },
    { value: { country: "BR", cities: [city("Rio de Janeiro", 1), city("São Paulo", 1)] }, weight: 2 },
    { value: { country: "US", cities: [city("Boston", 1), city("New York", 1)] }, weight: 2 },
  ],
  devices: [
    { value: { deviceType: "mobile", browser: "Mobile Safari", os: "iOS" }, weight: 54 },
    { value: { deviceType: "mobile", browser: "Chrome", os: "Android" }, weight: 30 },
    { value: { deviceType: "mobile", browser: "Samsung Internet", os: "Android" }, weight: 10 },
    { value: { deviceType: "tablet", browser: "Mobile Safari", os: "iOS" }, weight: 3 },
    { value: { deviceType: "desktop", browser: "Chrome", os: "Windows" }, weight: 3 },
  ],
  referrers: [
    { value: null, weight: 90 },
    { value: "www.google.com", weight: 5 },
    { value: "www.instagram.com", weight: 3 },
    { value: "www.tripadvisor.com", weight: 2 },
  ],
  utm: [
    { value: { source: "qr", medium: "print", campaign: "table-card" }, weight: 70 },
    { value: { source: "qr", medium: "print", campaign: "window-sticker" }, weight: 18 },
    { value: null, weight: 12 },
  ],
  languages: [
    { value: "pt", weight: 70 },
    { value: "en", weight: 14 },
    { value: "es", weight: 8 },
    { value: "fr", weight: 5 },
    { value: "de", weight: 3 },
  ],
  botShare: 0.01,
};

export const SCENARIOS: Record<ScenarioId, DemoScenario> = { launch: LAUNCH, podcast: PODCAST, menu: MENU };
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === "string" && value in SCENARIOS;
}

/** mulberry32: tiny, fast, deterministic PRNG returning floats in [0, 1). */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(items: WeightedList<T>, random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  let chosen = items[0];
  for (const item of items) {
    chosen = item;
    roll -= item.weight;
    if (roll < 0) break;
  }
  return chosen.value;
}

export interface SampleVisit {
  country: string;
  city: string;
  deviceType: "desktop" | "mobile" | "tablet" | "bot";
  browser: string;
  os: string;
  referrerHost: string | null;
  utm: UtmProfile | null;
  language: string;
  isBot: boolean;
}

/** Draw one plausible visit from a scenario's profile. */
export function sampleVisit(scenario: DemoScenario, random: () => number): SampleVisit {
  const location = pick(scenario.locations, random);
  const isBot = random() < scenario.botShare;
  const device = pick(scenario.devices, random);
  return {
    country: location.country,
    city: pick(location.cities, random),
    deviceType: isBot ? "bot" : device.deviceType,
    browser: isBot ? "Googlebot" : device.browser,
    os: isBot ? "Other" : device.os,
    referrerHost: isBot ? null : pick(scenario.referrers, random),
    utm: pick(scenario.utm, random),
    language: pick(scenario.languages, random),
    isBot,
  };
}
