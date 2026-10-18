export interface PasswordVerification {
  valid: boolean;
  /** True when the stored hash uses a legacy algorithm and should be upgraded. */
  needsRehash: boolean;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<PasswordVerification>;
}
