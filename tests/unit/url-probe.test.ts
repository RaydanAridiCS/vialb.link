import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  guardedLookup,
  HttpUrlProbe,
  isBlockedTarget,
  mapNetworkError,
  ProbeError,
  type Transport,
  type TransportResponse,
} from "@/server/adapters/url-probe";

const UA = "Vialb-LinkHealth/1.0 (+https://sho.rt)";

/** A transport that answers from a script keyed by `METHOD url`. */
function scripted(script: Record<string, TransportResponse | ProbeError>) {
  const calls: string[] = [];
  const transport: Transport = async (url, method) => {
    const key = `${method} ${url.href}`;
    calls.push(key);
    const answer = script[key];
    if (!answer) throw new ProbeError("network");
    if (answer instanceof ProbeError) throw answer;
    return answer;
  };
  return { transport, calls };
}

const ok = (status = 200): TransportResponse => ({ status, location: null });
const redirect = (location: string, status = 302): TransportResponse => ({ status, location });

describe("HttpUrlProbe redirect handling", () => {
  it("follows a chain and reports where it ended", async () => {
    const { transport, calls } = scripted({
      "HEAD https://a.example/": redirect("https://b.example/x"),
      "HEAD https://b.example/x": redirect("/final"),
      "HEAD https://b.example/final": ok(),
    });
    const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
    expect(result).toEqual({ ok: true, status: 200, reason: null, finalUrl: "https://b.example/final" });
    expect(calls).toHaveLength(3);
  });

  it("detects a redirect loop", async () => {
    const { transport } = scripted({
      "HEAD https://a.example/": redirect("https://a.example/b"),
      "HEAD https://a.example/b": redirect("https://a.example/"),
    });
    const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
    expect(result).toMatchObject({ ok: false, reason: "redirect_loop" });
  });

  it("stops after the redirect limit", async () => {
    let hop = 0;
    const transport: Transport = async (url) => redirect(`${url.origin}/hop-${++hop}`);
    const result = await new HttpUrlProbe({ userAgent: UA, transport, maxRedirects: 5 }).probe(
      "https://a.example/",
    );
    expect(result).toMatchObject({ ok: false, reason: "too_many_redirects" });
  });

  it("refuses a redirect to a private address, even after a public hop", async () => {
    for (const target of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8080/admin",
      "http://[::1]/",
      "http://10.0.0.5/",
      "http://localhost/",
      "http://intranet/",
      "http://[::ffff:7f00:1]/",
    ]) {
      const { transport, calls } = scripted({ "HEAD https://a.example/": redirect(target) });
      const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
      expect(result, target).toMatchObject({ ok: false, reason: "blocked_target" });
      expect(calls, target).toEqual(["HEAD https://a.example/"]);
    }
  });

  it("refuses redirects to other schemes and to URLs with credentials", async () => {
    for (const target of ["ftp://a.example/", "javascript:alert(1)", "https://user:pw@a.example/"]) {
      const { transport } = scripted({ "HEAD https://a.example/": redirect(target) });
      const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
      expect(result, target).toMatchObject({ ok: false, reason: "blocked_target" });
    }
  });

  it("can be told to allow private targets", async () => {
    const { transport } = scripted({ "HEAD http://10.0.0.5/": ok() });
    const result = await new HttpUrlProbe({ userAgent: UA, transport, allowPrivate: true }).probe(
      "http://10.0.0.5/",
    );
    expect(result.ok).toBe(true);
  });
});

describe("HttpUrlProbe status handling", () => {
  it.each([
    [404, "not_found"],
    [410, "not_found"],
    [500, "server_error"],
    [503, "server_error"],
  ])("treats %i as %s", async (status, reason) => {
    const { transport } = scripted({
      "HEAD https://a.example/": ok(status),
      "GET https://a.example/": ok(status),
    });
    const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
    expect(result).toMatchObject({ ok: false, status, reason });
  });

  it.each([200, 204, 301, 401, 403, 429, 400, 405])("does not treat %i as a failure", async (status) => {
    const { transport } = scripted({
      "HEAD https://a.example/": ok(status),
      "GET https://a.example/": ok(status),
    });
    const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
    expect(result.ok).toBe(true);
  });

  it("falls back to GET when HEAD is rejected, and trusts the GET answer", async () => {
    const { transport, calls } = scripted({
      "HEAD https://a.example/": ok(405),
      "GET https://a.example/": ok(200),
    });
    const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(calls).toEqual(["HEAD https://a.example/", "GET https://a.example/"]);
  });

  it("falls back to GET when HEAD errors out at the network level", async () => {
    const { transport } = scripted({
      "HEAD https://a.example/": new ProbeError("network"),
      "GET https://a.example/": ok(200),
    });
    expect((await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/")).ok).toBe(true);
  });

  it.each(["blocked_target", "dns", "timeout", "tls"] as const)(
    "does not retry with GET after a %s failure",
    async (reason) => {
      const { transport, calls } = scripted({ "HEAD https://a.example/": new ProbeError(reason) });
      const result = await new HttpUrlProbe({ userAgent: UA, transport }).probe("https://a.example/");
      expect(result).toMatchObject({ ok: false, reason });
      expect(calls).toHaveLength(1);
    },
  );

  it("rejects non-http URLs outright", async () => {
    const { transport, calls } = scripted({});
    for (const url of ["ftp://a.example/", "not a url", "https://u:p@a.example/"]) {
      expect(await new HttpUrlProbe({ userAgent: UA, transport }).probe(url)).toMatchObject({
        ok: false,
        reason: "blocked_target",
      });
    }
    expect(calls).toEqual([]);
  });
});

describe("isBlockedTarget", () => {
  it.each([
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
    "http://localhost:3000/",
    "http://2130706433/",
  ])("blocks %s", (url) => {
    expect(isBlockedTarget(new URL(url))).toBe(true);
  });
  it.each(["https://example.com/", "http://8.8.8.8/", "https://[2606:4700:4700::1111]/"])(
    "allows %s",
    (url) => {
      expect(isBlockedTarget(new URL(url))).toBe(false);
    },
  );
});

describe("guardedLookup (checked when the socket connects)", () => {
  afterEach(() => vi.restoreAllMocks());

  function resolveTo(...addresses: string[]) {
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (...args: unknown[]) => void,
    ) => {
      cb(
        null,
        addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
      );
    }) as unknown as typeof dns.lookup);
  }

  const lookup = (hostname: string, all = false) =>
    new Promise<{ error: NodeJS.ErrnoException | null; result: unknown }>((resolve) => {
      guardedLookup(hostname, { all }, ((error: NodeJS.ErrnoException | null, result: unknown) =>
        resolve({ error, result })) as never);
    });

  it("lets a host with only public addresses through", async () => {
    resolveTo("93.184.216.34");
    expect(await lookup("example.com")).toEqual({ error: null, result: "93.184.216.34" });
    expect((await lookup("example.com", true)).result).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses a host that resolves to a private address (DNS rebinding)", async () => {
    resolveTo("127.0.0.1");
    expect((await lookup("evil.example")).error?.code).toBe("EBLOCKED");
  });

  it("refuses when any one of several answers is private", async () => {
    resolveTo("93.184.216.34", "10.0.0.7");
    expect((await lookup("mixed.example", true)).error?.code).toBe("EBLOCKED");
    resolveTo("2606:4700:4700::1111", "fe80::1");
    expect((await lookup("mixed6.example", true)).error?.code).toBe("EBLOCKED");
  });

  it("refuses an empty answer and passes resolver errors through", async () => {
    resolveTo();
    expect((await lookup("nothing.example")).error?.code).toBe("EBLOCKED");
    vi.spyOn(dns, "lookup").mockImplementation(((_h: string, _o: unknown, cb: (...args: unknown[]) => void) =>
      cb(Object.assign(new Error("nx"), { code: "ENOTFOUND" }))) as unknown as typeof dns.lookup);
    expect((await lookup("missing.example")).error?.code).toBe("ENOTFOUND");
  });
});

describe("mapNetworkError", () => {
  it.each([
    [{ name: "AbortError" }, "timeout"],
    [{ name: "TimeoutError" }, "timeout"],
    [{ code: "ETIMEDOUT" }, "timeout"],
    [{ code: "ENOTFOUND" }, "dns"],
    [{ code: "EAI_AGAIN" }, "dns"],
    [{ code: "EBLOCKED" }, "blocked_target"],
    [{ code: "CERT_HAS_EXPIRED" }, "tls"],
    [{ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }, "tls"],
    [{ code: "ERR_TLS_CERT_ALTNAME_INVALID" }, "tls"],
    [{ code: "ECONNREFUSED" }, "network"],
    [{ code: "ECONNRESET" }, "network"],
    [null, "network"],
  ])("maps %j to %s", (error, reason) => {
    expect(mapNetworkError(error)).toBe(reason);
  });
});

describe("the real transport against a local server", () => {
  const seen: { method: string; url: string; userAgent: string | undefined }[] = [];
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", userAgent: req.headers["user-agent"] });
      const url = req.url ?? "/";
      if (url === "/ok") return void res.writeHead(200).end("hello");
      if (url === "/missing") return void res.writeHead(404).end();
      if (url === "/boom") return void res.writeHead(500).end();
      if (url === "/head-405") {
        return void (req.method === "HEAD" ? res.writeHead(405).end() : res.writeHead(200).end("yes"));
      }
      if (url === "/hop") return void res.writeHead(302, { location: "/ok" }).end();
      if (url === "/loop") return void res.writeHead(302, { location: "/loop2" }).end();
      if (url === "/loop2") return void res.writeHead(302, { location: "/loop" }).end();
      if (url === "/slow") return; // never answers
      res.writeHead(200).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const probe = (path: string, options: { allowPrivate?: boolean; timeoutMs?: number } = {}) =>
    new HttpUrlProbe({ userAgent: UA, allowPrivate: true, ...options }).probe(`${base}${path}`);

  it("is refused by default: loopback is never contacted", async () => {
    const before = seen.length;
    const result = await new HttpUrlProbe({ userAgent: UA }).probe(`${base}/ok`);
    expect(result).toMatchObject({ ok: false, reason: "blocked_target" });
    expect(seen.length).toBe(before);
  });

  it("checks status codes and identifies itself", async () => {
    seen.length = 0;
    expect(await probe("/ok")).toMatchObject({ ok: true, status: 200 });
    expect(seen[0]).toMatchObject({ method: "HEAD", userAgent: UA });
    expect(await probe("/missing")).toMatchObject({ ok: false, reason: "not_found", status: 404 });
    expect(await probe("/boom")).toMatchObject({ ok: false, reason: "server_error", status: 500 });
  });

  it("uses GET when HEAD is refused, and follows redirects", async () => {
    seen.length = 0;
    expect(await probe("/head-405")).toMatchObject({ ok: true, status: 200 });
    expect(seen.map((s) => s.method)).toEqual(["HEAD", "GET"]);
    expect(await probe("/hop")).toMatchObject({ ok: true, finalUrl: `${base}/ok` });
  });

  it("detects loops and times out on a server that never answers", async () => {
    expect(await probe("/loop")).toMatchObject({ ok: false, reason: "redirect_loop" });
    expect(await probe("/slow", { timeoutMs: 150 })).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("reports a closed port as a network failure", async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const result = await new HttpUrlProbe({ userAgent: UA, allowPrivate: true }).probe(
      `http://127.0.0.1:${port}/`,
    );
    expect(result).toMatchObject({ ok: false, reason: "network" });
  });
});
