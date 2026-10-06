/**
 * Which Host headers and which browser Origins may reach `/mcp`.
 *
 * Host validation is the DNS-rebinding defence the MCP spec asks HTTP servers
 * for: a rebound request still carries the attacker's hostname in `Host`.
 * Origin validation decides which browser pages may call the server at all.
 * Requests with no `Origin` header come from non-browser clients (Claude Code,
 * Cursor, VS Code, hosted connectors) and are always accepted.
 *
 * Pure functions, no I/O, so the policy is testable without a socket.
 */

/** `'*'` turns the check off; otherwise the exact values that pass. */
export type AllowList = '*' | readonly string[];

/** The hostnames a loopback-bound server answers to. */
export const LOOPBACK_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

// A Host header is a hostname plus an optional port. Anything that could make
// URL parsing pick a different hostname (userinfo, a path, whitespace) is
// rejected outright rather than parsed.
const UNSAFE_HOST_CHARS = /[@/\\?#\s]/;

/**
 * The lowercased hostname of a Host header value, port stripped. IPv6 keeps
 * its brackets (`[::1]`). `undefined` for a missing or malformed value.
 */
export function hostnameOf(hostHeader: string | undefined): string | undefined {
  if (!hostHeader || UNSAFE_HOST_CHARS.test(hostHeader)) return undefined;
  try {
    const { hostname } = new URL(`http://${hostHeader}`);
    return hostname === '' ? undefined : hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function splitList(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse a comma-separated list of hostnames. Ports are ignored, so
 * `mcp.apexcharts.com:443` means `mcp.apexcharts.com`. Unset or blank returns
 * `fallback`; any `*` entry returns `'*'`. Throws on an entry that is not a
 * hostname, so a typo fails at startup instead of refusing every request.
 */
export function parseHostAllowList(raw: string | undefined, fallback: AllowList): AllowList {
  const entries = splitList(raw);
  if (!entries) return fallback;
  if (entries.includes('*')) return '*';
  return entries.map((entry) => {
    const hostname = hostnameOf(entry);
    if (!hostname) throw new Error(`not a hostname: "${entry}"`);
    return hostname;
  });
}

/**
 * Parse a comma-separated list of origins (`https://example.com`). Each entry
 * is normalised, so a trailing slash or uppercase letters still match. Unset
 * or blank returns `fallback`; any `*` entry returns `'*'`. Throws on an entry
 * that is not an http(s) origin.
 */
export function parseOriginAllowList(raw: string | undefined, fallback: AllowList): AllowList {
  const entries = splitList(raw);
  if (!entries) return fallback;
  if (entries.includes('*')) return '*';
  return entries.map((entry) => {
    const origin = normalizeOrigin(entry);
    if (!origin) throw new Error(`not an http(s) origin: "${entry}"`);
    return origin;
  });
}

function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function isHostAllowed(hostHeader: string | undefined, allowed: AllowList): boolean {
  if (allowed === '*') return true;
  const hostname = hostnameOf(hostHeader);
  return hostname !== undefined && allowed.includes(hostname);
}

/**
 * The value for `Access-Control-Allow-Origin`, or `undefined` when the origin
 * may not call the server. A request with no `Origin` is not a browser
 * cross-origin call, so it passes without needing a CORS header.
 */
export function resolveAllowedOrigin(
  originHeader: string | undefined,
  allowed: AllowList,
): { allowed: true; corsOrigin?: string } | { allowed: false } {
  if (originHeader === undefined) return { allowed: true };
  if (allowed === '*') return { allowed: true, corsOrigin: '*' };
  // Sandboxed iframes and file:// pages send the literal string "null".
  const origin = normalizeOrigin(originHeader);
  if (!origin || !allowed.includes(origin)) return { allowed: false };
  return { allowed: true, corsOrigin: origin };
}
