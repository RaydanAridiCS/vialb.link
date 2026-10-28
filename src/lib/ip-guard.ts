/**
 * Decides whether an address is safe to contact from the server on behalf of a user-supplied URL
 * (SSRF protection). Pure and dependency-free so the same rules are unit-tested and reused by the
 * link health monitor's connection hook.
 *
 * "Public" means globally routable unicast. Everything else (loopback, private, link-local, CGNAT,
 * documentation, multicast, reserved, and IPv6 forms that embed an IPv4 address) is refused.
 */

/** [network, prefix length] pairs that are NOT public IPv4 space. */
const BLOCKED_V4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inV4Range(value: number, [network, prefix]: readonly [string, number]): boolean {
  const base = v4ToInt(network);
  if (base === null) return false;
  const size = 2 ** (32 - prefix);
  return value >= base && value < base + size;
}

export function isPublicIPv4(address: string): boolean {
  const value = v4ToInt(address);
  if (value === null) return false;
  return !BLOCKED_V4.some((range) => inV4Range(value, range));
}

/** Expands an IPv6 literal into eight 16-bit groups, or `null` when it is malformed. */
function parseV6(input: string): number[] | null {
  let address = input.trim();
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  if (!address.includes(":")) return null;

  // A trailing dotted IPv4 (::ffff:1.2.3.4) stands for the last two groups.
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = v4ToInt(tail);
    if (v4 === null) return null;
    address = `${address.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const toGroups = (text: string) => (text === "" ? [] : text.split(":"));
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + rest.length > 7) return null;

  const groups = [
    ...head,
    ...Array(halves.length === 2 ? 8 - head.length - rest.length : 0).fill("0"),
    ...rest,
  ];
  if (groups.length !== 8) return null;
  const numbers: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    numbers.push(parseInt(group, 16));
  }
  return numbers;
}

function embeddedV4(high: number, low: number): string {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPublicIPv6(address: string): boolean {
  const g = parseV6(address);
  if (!g) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  // ::, ::1 and IPv4-compatible (::a.b.c.d): the embedded address decides, and 0/8 is blocked anyway.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicIPv4(embeddedV4(g6, g7));
  }
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-translated (::ffff:0:a.b.c.d).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isPublicIPv4(embeddedV4(g6, g7));
  }
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return isPublicIPv4(embeddedV4(g6, g7));
  }
  // NAT64 well-known prefix 64:ff9b::/96.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicIPv4(embeddedV4(g6, g7));
  }
  // 6to4 (2002::/16) carries an IPv4 address in the next 32 bits.
  if (g0 === 0x2002) return isPublicIPv4(embeddedV4(g1, g2));
  // Teredo (2001:0::/32) and documentation space (2001:db8::/32).
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0x0db8)) return false;
  // Only global unicast 2000::/3 is public; this excludes ULA, link-local, site-local and multicast.
  return (g0 & 0xe000) === 0x2000;
}

export function isPublicAddress(address: string): boolean {
  return address.includes(":") ? isPublicIPv6(address) : isPublicIPv4(address);
}

const FORBIDDEN_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".localdomain"];

/**
 * Host names that must never be contacted even before resolving them: localhost-style names and
 * single-label names (which would resolve through a search domain on the server's network).
 */
export function isForbiddenHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "" || host === "localhost") return true;
  if (FORBIDDEN_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const isIpLiteral = host.includes(":") || /^[\d.]+$/.test(host);
  return !isIpLiteral && !host.includes(".");
}
