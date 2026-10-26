import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { redactUrl, redactUrlsInText, scrubEvent } from "@/lib/sentry-scrub";

describe("redactUrl", () => {
  it("keeps origin and path, drops credentials, query and fragment", () => {
    expect(redactUrl("https://user:pw@example.com/a/b?token=secret&x=1#frag")).toBe(
      "https://example.com/a/b",
    );
  });

  it("strips the query of a relative or unparseable value", () => {
    expect(redactUrl("/dashboard/links?tag=promo")).toBe("/dashboard/links");
  });
});

describe("redactUrlsInText", () => {
  it("redacts every URL in a message and leaves the rest alone", () => {
    expect(
      redactUrlsInText("fetch failed for https://a.example/x?key=1 then (http://u:p@b.example/y#z) gave up"),
    ).toBe("fetch failed for https://a.example/x then (http://b.example/y) gave up");
  });
});

describe("redactUrlsInText with SQL errors", () => {
  it("drops the bound parameters Drizzle appends to a failed query", () => {
    const message =
      'Failed query: insert into "links" ("destination_url") values ($1)\nparams: https://dest.example/p?x=1,me@example.com';
    expect(redactUrlsInText(message)).toBe(
      'Failed query: insert into "links" ("destination_url") values ($1)\nparams: [redacted]',
    );
  });
});

describe("scrubEvent", () => {
  it("removes cookies, auth headers, bodies, queries, user data and URLs in messages", () => {
    const event = {
      type: undefined,
      message: "bad destination https://evil.example/p?secret=1",
      user: { id: "u1", ip_address: "1.2.3.4" },
      request: {
        url: "https://vialb.link/abc?utm_source=x",
        query_string: "utm_source=x",
        cookies: { session: "s" },
        data: { password: "hunter2" },
        headers: { Cookie: "a=b", Authorization: "Bearer t", "X-Api-Key": "k", "user-agent": "ua" },
      },
      exception: { values: [{ type: "Error", value: "GET https://x.example/y?token=z failed" }] },
      breadcrumbs: [{ message: "https://c.example/d?e=1", data: { url: "https://c.example/d?e=1" } }],
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.message).toBe("bad destination https://evil.example/p");
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request?.url).toBe("https://vialb.link/abc");
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.headers).toEqual({ "user-agent": "ua" });
    expect(scrubbed.exception?.values?.[0]?.value).toBe("GET https://x.example/y failed");
    expect(scrubbed.breadcrumbs?.[0]).toEqual({ message: "https://c.example/d" });
  });

  it("tolerates an event without optional parts", () => {
    expect(scrubEvent({ type: undefined } as unknown as ErrorEvent)).toEqual({ type: undefined });
  });
});
