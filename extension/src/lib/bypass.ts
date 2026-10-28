export const MAX_BYPASS_ENTRIES = 50;

const BASE_PATTERNS = ["<local>", "localhost", "127.0.0.1", "[::1]"];
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIpv4(value: string): boolean {
  const match = IPV4.exec(value);
  return Boolean(match && match.slice(1).every((part) => Number(part) <= 255));
}

/** Accepts a domain or URL and returns a lowercase hostname, or null. */
export function normalizeBypassEntry(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let value = raw.toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
  if (!value) return null;

  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  if (!scheme) value = `http://${value}`;

  let host: string;
  try {
    host = new URL(value).hostname.replace(/\.$/, "");
  } catch {
    return null;
  }

  // IPv6 literals are not supported here; loopback is already bypassed.
  if (host.startsWith("[") || !HOSTNAME.test(host)) return null;
  if (/^\d+(\.\d+){3}$/.test(host) && !isIpv4(host)) return null;
  return host;
}

export function normalizeBypassList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const entry = normalizeBypassEntry(item);
    if (entry && !entries.includes(entry)) entries.push(entry);
    if (entries.length >= MAX_BYPASS_ENTRIES) break;
  }
  return entries;
}

export function buildBypassPatterns(entries: readonly string[]): string[] {
  const patterns = [...BASE_PATTERNS];
  for (const entry of entries) {
    patterns.push(entry);
    // Chrome's wildcard form covers subdomains; keep the bare host too.
    if (!isIpv4(entry)) patterns.push(`*.${entry}`);
  }
  return [...new Set(patterns)];
}
