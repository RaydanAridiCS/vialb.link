import { describe, expect, it, vi } from "vitest";
import { RedisRateLimiter } from "@/server/adapters/rate-limiters";
import { collectConfigWarnings, type ConfigSnapshot } from "@/server/startup-checks";

const healthy: ConfigSnapshot = {
  NODE_ENV: "production",
  SITE_URL: "https://vialb.link",
  REDIS_URL: "redis://localhost:6379",
  SAFE_BROWSING_API_KEY: "key",
  TURNSTILE_SITE_KEY: "site",
  TURNSTILE_SECRET_KEY: "secret",
  ALLOW_ANONYMOUS_LINKS: true,
  TRUST_PROXY: true,
  SENTRY_DSN: "https://abc@o1.ingest.sentry.io/1",
};

describe("collectConfigWarnings", () => {
  it("is silent for a fully configured production instance", () => {
    expect(collectConfigWarnings(healthy)).toEqual([]);
  });

  it("flags every weakness of a bare production instance", () => {
    const warnings = collectConfigWarnings({
      NODE_ENV: "production",
      SITE_URL: "http://example.com",
      ALLOW_ANONYMOUS_LINKS: false,
      TRUST_PROXY: false,
    });
    expect(warnings).toHaveLength(5);
    expect(warnings.join("\n")).toMatch(/REDIS_URL/);
    expect(warnings.join("\n")).toMatch(/SAFE_BROWSING_API_KEY/);
    expect(warnings.join("\n")).toMatch(/SENTRY_DSN/);
    expect(warnings.join("\n")).toMatch(/SITE_URL/);
    expect(warnings.join("\n")).toMatch(/TRUST_PROXY/);
  });

  it("does not nag about production-only settings in development", () => {
    expect(
      collectConfigWarnings({
        NODE_ENV: "development",
        SITE_URL: "http://localhost:3000",
        ALLOW_ANONYMOUS_LINKS: false,
        TRUST_PROXY: false,
      }),
    ).toEqual([]);
  });

  it("flags a half-configured Turnstile in any environment", () => {
    const base = { ...healthy, NODE_ENV: "development" as const };
    expect(collectConfigWarnings({ ...base, TURNSTILE_SECRET_KEY: undefined })).toEqual([
      expect.stringContaining("TURNSTILE_SITE_KEY is set without TURNSTILE_SECRET_KEY"),
      expect.stringContaining("Anonymous link creation"),
    ]);
    expect(collectConfigWarnings({ ...base, TURNSTILE_SITE_KEY: undefined })).toEqual([
      expect.stringContaining("TURNSTILE_SECRET_KEY is set without TURNSTILE_SITE_KEY"),
      expect.stringContaining("Anonymous link creation"),
    ]);
  });

  it("flags anonymous creation without a captcha, but not when anonymous links are off", () => {
    const noCaptcha = { ...healthy, TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined };
    expect(collectConfigWarnings(noCaptcha)).toEqual([expect.stringContaining("Anonymous link creation")]);
    expect(collectConfigWarnings({ ...noCaptcha, ALLOW_ANONYMOUS_LINKS: false })).toEqual([]);
  });
});

describe("RedisRateLimiter", () => {
  it("counts through the Lua script and reports the remaining budget", async () => {
    const redis = { eval: vi.fn().mockResolvedValue([2, 5000]) };
    const limiter = new RedisRateLimiter(redis);
    const result = await limiter.consume("k", 3, 10_000);
    expect(result).toMatchObject({ allowed: true, limit: 3, remaining: 1 });
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "vialb:rl:k", "10000");
  });

  it("blocks once the limit is exceeded", async () => {
    const limiter = new RedisRateLimiter({ eval: vi.fn().mockResolvedValue([4, 5000]) });
    expect(await limiter.consume("k", 3, 10_000)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("fails open when Redis is unavailable", async () => {
    const limiter = new RedisRateLimiter({ eval: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    expect(await limiter.consume("k", 3, 10_000)).toMatchObject({ allowed: true, limit: 3, remaining: 3 });
  });
});
