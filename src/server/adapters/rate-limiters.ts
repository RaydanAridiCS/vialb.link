import type { Redis } from "ioredis";
import type { RateLimiter, RateLimitResult } from "@/server/ports/rate-limiter";

/**
 * Fixed-window limiter kept in process memory. Correct for a single
 * instance; use the Redis limiter (REDIS_URL) when running several replicas.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = this.now();
    this.sweep(now);
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt: entry.resetAt,
    };
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.windows) if (entry.resetAt <= now) this.windows.delete(key);
  }
}

const REDIS_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

/** Fixed-window limiter in Redis (atomic INCR + PEXPIRE via Lua). */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "toolwright:rl:",
  ) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const [count, ttl] = (await this.redis.eval(
      REDIS_SCRIPT,
      1,
      `${this.prefix}${key}`,
      String(windowMs),
    )) as [number, number];
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: Date.now() + (ttl > 0 ? ttl : windowMs),
    };
  }
}
