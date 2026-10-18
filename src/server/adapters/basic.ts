import { customAlphabet } from "nanoid";
import { CODE_ALPHABET } from "@/lib/constants";
import type { Clock } from "@/server/ports/clock";
import type { CodeGenerator } from "@/server/ports/code-generator";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Crypto-secure nanoid over a look-alike-free base62 alphabet. */
export class NanoidCodeGenerator implements CodeGenerator {
  private readonly cache = new Map<number, () => string>();

  generate(length: number): string {
    let fn = this.cache.get(length);
    if (!fn) {
      fn = customAlphabet(CODE_ALPHABET, length);
      this.cache.set(length, fn);
    }
    return fn();
  }
}
