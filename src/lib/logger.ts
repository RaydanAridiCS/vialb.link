import { createRequire } from "node:module";
import pino, { type DestinationStream, type Logger } from "pino";
import { APP_NAME } from "@/lib/constants";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function prettyStream(): DestinationStream | undefined {
  if (isProduction || isTest) return undefined;
  try {
    // pino-pretty is a dev dependency; load it lazily so production bundles
    // never need it. Using a stream (not a transport) avoids worker threads.
    const require = createRequire(import.meta.url);
    const pretty = require("pino-pretty") as (opts: Record<string, unknown>) => DestinationStream;
    return pretty({ colorize: true, sync: true, ignore: "pid,hostname,app" });
  } catch {
    return undefined;
  }
}

/** Structured logger: pretty in development, JSON lines in production. */
export const logger: Logger = pino(
  {
    name: APP_NAME.toLowerCase(),
    level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
    base: { app: APP_NAME.toLowerCase() },
    redact: {
      paths: ["password", "*.password", "headers.authorization", "headers.cookie", "token", "*.token"],
      censor: "[redacted]",
    },
  },
  prettyStream(),
);

export type { Logger };
