/** Source of "now". Injected so expiry math and analytics ranges are testable. */
export interface Clock {
  now(): Date;
}
