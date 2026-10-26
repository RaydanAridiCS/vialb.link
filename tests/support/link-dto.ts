import type { LinkDto } from "@/server/services/dto";

let counter = 0;

/** A complete `LinkDto` for component tests; override only what the test cares about. */
export function makeLinkDto(overrides: Partial<LinkDto> = {}): LinkDto {
  counter += 1;
  const code = overrides.code ?? `code${counter}`;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    code,
    shortUrl: `https://sho.rt/${code}`,
    destinationUrl: `https://example.com/${code}`,
    title: null,
    tags: [],
    routingRules: [],
    cardDesign: null,
    pixels: null,
    hasPassword: false,
    expiresAt: null,
    maxClicks: null,
    clickCount: 0,
    isEnabled: true,
    status: "active",
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    qrFgColor: "#000000",
    qrBgColor: "#FFFFFF",
    qrEcc: "M",
    qrFrame: "none",
    qrFrameText: null,
    ownerId: "user-1",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}
