import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { compare as bcryptCompare } from "bcryptjs";
import type { PasswordHasher, PasswordVerification } from "@/server/ports/password-hasher";

/** OWASP-recommended argon2id parameters (19 MiB, t=2, p=1). Argon2id is the library default. */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const BCRYPT_PREFIX = /^\$2[aby]\$/;

/**
 * argon2id for every new hash. Legacy bcrypt hashes (imported from the old
 * app) still verify and are reported as `needsRehash` so callers can upgrade
 * them transparently.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return argonHash(plain, ARGON2_OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<PasswordVerification> {
    try {
      if (BCRYPT_PREFIX.test(hash)) {
        const valid = await bcryptCompare(plain, hash);
        return { valid, needsRehash: valid };
      }
      return { valid: await argonVerify(hash, plain), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }
}
