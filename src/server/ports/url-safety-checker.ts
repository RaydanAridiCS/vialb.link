export interface UrlSafetyVerdict {
  safe: boolean;
  reason?: string;
}

export interface UrlSafetyChecker {
  check(url: string): Promise<UrlSafetyVerdict>;
}
