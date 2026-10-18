export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the current window resets. */
  resetAt: number;
}

export interface RateLimiter {
  /** Consumes one token for `key` in a fixed window of `windowMs`. */
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}
