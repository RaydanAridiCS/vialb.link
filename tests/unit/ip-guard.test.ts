import { describe, expect, it } from "vitest";
import { isForbiddenHostname, isPublicAddress, isPublicIPv4, isPublicIPv6 } from "@/lib/ip-guard";

describe("isPublicIPv4", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "11.0.0.1",
    "192.169.0.1",
    "223.255.255.255",
  ])("allows %s", (address) => {
    expect(isPublicIPv4(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.5",
    "203.0.113.9",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
  ])("blocks %s", (address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });

  it.each(["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "a.b.c.d", "1.2.3.-4", "01.2.3.4444"])(
    "treats malformed %j as unsafe",
    (address) => {
      expect(isPublicIPv4(address)).toBe(false);
    },
  );
});

describe("isPublicIPv6", () => {
  it.each(["2001:4860:4860::8888", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "[2606:4700::1111]"])(
    "allows %s",
    (address) => {
      expect(isPublicIPv6(address)).toBe(true);
    },
  );

  it.each([
    "::",
    "::1",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fd12:3456:789a::1",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "100::1",
    "64:ff9b::7f00:1",
  ])("blocks %s", (address) => {
    expect(isPublicIPv6(address)).toBe(false);
  });

  it("looks through addresses that embed an IPv4 address", () => {
    expect(isPublicIPv6("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIPv6("::ffff:7f00:1")).toBe(false);
    expect(isPublicIPv6("::ffff:10.1.2.3")).toBe(false);
    expect(isPublicIPv6("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicIPv6("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicIPv6("::ffff:0:8.8.8.8")).toBe(true);
    expect(isPublicIPv6("::ffff:0:127.0.0.1")).toBe(false);
    expect(isPublicIPv6("64:ff9b::808:808")).toBe(true);
    expect(isPublicIPv6("2002:7f00:1::")).toBe(false); // 6to4 wrapping 127.0.0.1
    expect(isPublicIPv6("2002:0808:0808::")).toBe(true); // 6to4 wrapping 8.8.8.8
  });

  it.each(["", "1:2:3", "1:2:3:4:5:6:7:8:9", ":::", "1::2::3", "g::1", "12345::1"])(
    "treats malformed %j as unsafe",
    (address) => {
      expect(isPublicIPv6(address)).toBe(false);
    },
  );
});

describe("isPublicAddress", () => {
  it("dispatches on the address family", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("10.0.0.1")).toBe(false);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAddress("::1")).toBe(false);
  });
});

describe("isForbiddenHostname", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "app.localhost",
    "printer.local",
    "db.internal",
    "nas.lan",
    "x.home.arpa",
    "intranet",
    "",
  ])("refuses %j", (host) => {
    expect(isForbiddenHostname(host)).toBe(true);
  });

  it.each(["example.com", "sub.example.co.uk", "xn--bcher-kva.example", "8.8.8.8", "[::1]".slice(1, -1)])(
    "does not refuse %j by name",
    (host) => {
      expect(isForbiddenHostname(host)).toBe(false);
    },
  );

  it("ignores a trailing dot", () => {
    expect(isForbiddenHostname("localhost.")).toBe(true);
    expect(isForbiddenHostname("example.com.")).toBe(false);
  });
});
