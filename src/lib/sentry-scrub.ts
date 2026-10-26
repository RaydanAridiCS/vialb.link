import type { ErrorEvent } from "@sentry/nextjs";

const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/gi;
const SENSITIVE_HEADERS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  "x-api-key",
  "proxy-authorization",
]);

/**
 * Keeps scheme, host and path of a URL and drops credentials, query string and
 * fragment. Short-link destinations and tokens often live in those parts, and
 * they must never leave the instance.
 */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0] ?? raw;
  }
}

/**
 * Drizzle appends the bound values to a failed query's message ("params: …").
 * They can hold destination URLs, emails or password hashes, so drop them.
 */
const SQL_PARAMS = /(\nparams:)[\s\S]*$/;

/** Redacts every URL and SQL parameter list embedded in free text (error messages, breadcrumbs). */
export function redactUrlsInText(text: string): string {
  return text.replace(SQL_PARAMS, "$1 [redacted]").replace(URL_IN_TEXT, (match) => redactUrl(match));
}

/** Sentry `beforeSend`: strips personal and destination data from an error event. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = redactUrl(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase())),
      );
    }
  }
  if (event.message) event.message = redactUrlsInText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactUrlsInText(exception.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = redactUrlsInText(crumb.message);
    if (crumb.data) delete crumb.data;
  }
  delete event.user;
  return event;
}
