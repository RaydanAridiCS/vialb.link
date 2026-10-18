export interface CaptchaVerifier {
  /** Whether a captcha is configured; when false, `verify` always passes. */
  readonly isEnabled: boolean;
  readonly siteKey: string | null;
  verify(token: string | undefined, ip: string | null): Promise<boolean>;
}
