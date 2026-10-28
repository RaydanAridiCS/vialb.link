import type { Instrumentation } from "next";

/**
 * Error monitoring is opt-in: nothing is loaded or sent unless SENTRY_DSN is
 * set. Server-side only on purpose; a client SDK needs a build-time public DSN,
 * which does not fit a prebuilt self-hosted image.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Not awaited: `register` must finish before the server accepts requests.
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    void import("@/server/jobs/start").then(({ startJobs }) => startJobs());
  }
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const [Sentry, { scrubEvent }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/sentry-scrub"),
  ]);
  Sentry.init({
    dsn,
    // The SDK collects most things by default; a link shortener must not ship
    // visitor data, destination URLs or secrets. scrubEvent is a second layer.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
