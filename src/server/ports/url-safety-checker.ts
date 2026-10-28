export interface UrlSafetyVerdict {
  safe: boolean;
  reason?: string;
}

export interface UrlSafetyChecker {
  /** `false` for the no-op checker: callers can skip work whose only purpose is a verdict. */
  readonly isConfigured: boolean;
  check(url: string): Promise<UrlSafetyVerdict>;
}
