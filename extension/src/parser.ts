import type {
  Network,
  ParseError,
  ParseResult,
  ParsedLink,
  Profile,
  Protocol,
  Security
} from "./types";

const SUPPORTED_NETWORKS: Network[] = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"];
const SS_METHODS = [
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20-poly1305",
  "chacha20-ietf-poly1305",
  "xchacha20-poly1305",
  "xchacha20-ietf-poly1305",
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305",
  "none",
  "plain"
];

export class LinkParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkParseError";
  }
}

function fail(message: string): never {
  throw new LinkParseError(message);
}

export function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    fail("Invalid base64 data in link");
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeNetwork(value: string | undefined): Network {
  const network = (value ?? "tcp").toLowerCase();
  if (network === "splithttp") return "xhttp";
  if (network === "raw") return "tcp";
  if (!SUPPORTED_NETWORKS.includes(network as Network)) {
    fail(
      `Transport "${value}" is not supported yet. Supported transports: ${SUPPORTED_NETWORKS.join(", ")}.`
    );
  }
  return network as Network;
}

function parseBoolean(value: string | null): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function normalizeHost(value: string): string {
  const host = value.trim().replace(/^\[|\]$/g, "");
  if (!host) fail("The link is missing a server address");
  if (/[\s/\\]/.test(host)) fail("The server address contains invalid characters");
  return host;
}

function parsePort(value: string | number): number {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("The link has an invalid port");
  }
  return port;
}

export function splitHostPort(value: string): { host: string; port: number } {
  let input = value.trim().replace(/\/+$/, "");
  if (input.startsWith("[")) {
    const end = input.indexOf("]");
    if (end === -1) fail("The link has an invalid IPv6 address");
    const host = input.slice(1, end);
    const rest = input.slice(end + 1);
    if (!rest.startsWith(":")) fail("The link is missing a port");
    return { host: normalizeHost(host), port: parsePort(rest.slice(1)) };
  }
  const separator = input.lastIndexOf(":");
  if (separator === -1) fail("The link is missing a port");
  return {
    host: normalizeHost(input.slice(0, separator)),
    port: parsePort(input.slice(separator + 1))
  };
}

function readSecurity(value: string | null, fallback: Security = "none"): Security {
  const security = (value?.toLowerCase() || fallback) as Security;
  if (!["none", "tls", "reality"].includes(security)) {
    fail(`Security "${value}" is not supported. Use none, tls, or reality.`);
  }
  return security;
}

function resolveName(url: URL, profile: Omit<Profile, "id" | "name" | "createdAt">): string {
  const fragment = url.hash ? safeDecode(url.hash.slice(1)).trim() : "";
  return (fragment || `${labelFor(profile.protocol)} ${profile.address}:${profile.port}`).slice(0, 100);
}

function labelFor(protocol: Protocol): string {
  switch (protocol) {
    case "vless":
      return "VLESS";
    case "vmess":
      return "VMess";
    case "trojan":
      return "Trojan";
    case "ss":
      return "Shadowsocks";
  }
}

function validateTransportFields(
  profile: Pick<Profile, "protocol" | "network" | "security" | "flow" | "path" | "sni">
): string[] {
  const warnings: string[] = [];
  if (profile.flow) {
    if (profile.flow !== "xtls-rprx-vision") {
      fail(`Flow "${profile.flow}" is not supported. Only xtls-rprx-vision is supported.`);
    }
    if (profile.protocol !== "vless") fail("XTLS flow is only supported with VLESS");
    if (profile.network !== "tcp") fail("XTLS flow requires the TCP transport");
    if (profile.security === "none") fail("XTLS flow requires TLS or REALITY");
  }
  if (profile.security === "reality" && profile.network === "ws") {
    fail("REALITY cannot be combined with the WebSocket transport");
  }
  if (profile.network === "ws" && !profile.path) {
    warnings.push("No WebSocket path was provided; using \"/\".");
  }
  if (profile.security === "tls" && !profile.sni) {
    warnings.push("No SNI was provided. The server may reject the TLS handshake.");
  }
  return warnings;
}

function parseVless(link: string): ParsedLink {
  const url = safeUrl(link);
  const uuid = safeDecode(url.username);
  if (!uuid) fail("The VLESS link is missing its UUID");
  const port = parsePort(url.port);
  const query = url.searchParams;
  const encryption = (query.get("encryption") || "none").toLowerCase();
  if (encryption !== "none") {
    fail("VLESS encryption must be \"none\". Other values are not supported by modern Xray.");
  }
  const security = readSecurity(query.get("security"));
  const network = normalizeNetwork(query.get("type") || undefined);
  const flow = query.get("flow") || undefined;
  const publicKey = query.get("pbk") || undefined;
  const shortId = query.get("sid") || undefined;
  const sni = query.get("sni") || query.get("peer") || undefined;

  if (security === "reality") {
    if (!publicKey) fail("REALITY link is missing the public key (pbk)");
    if (!sni) fail("REALITY link is missing the SNI/server name");
  }

  const profile: Omit<Profile, "id" | "name" | "createdAt"> = {
    protocol: "vless",
    address: normalizeHost(url.hostname),
    port,
    uuid,
    encryption: "none",
    flow,
    security,
    sni,
    fingerprint: query.get("fp") || undefined,
    alpn: query.get("alpn") || undefined,
    allowInsecure: parseBoolean(query.get("allowInsecure") || query.get("insecure")),
    publicKey,
    shortId,
    spiderX: query.get("spx") || undefined,
    network,
    path: query.get("path") || (network === "ws" || network === "xhttp" || network === "httpupgrade" ? "/" : undefined),
    host: query.get("host") || undefined,
    serviceName: query.get("serviceName") || query.get("servicename") || undefined,
    raw: link
  };

  const warnings = validateTransportFields(profile);
  return {
    profile: {
      ...profile,
      id: crypto.randomUUID(),
      name: resolveName(url, profile),
      createdAt: Date.now()
    },
    warnings
  };
}

function parseTrojan(link: string): ParsedLink {
  const url = safeUrl(link);
  const password = safeDecode(url.username);
  if (!password) fail("The Trojan link is missing its password");
  const port = parsePort(url.port);
  const query = url.searchParams;
  const security = readSecurity(query.get("security"), "tls");
  const network = normalizeNetwork(query.get("type") || undefined);
  const sni = query.get("sni") || query.get("peer") || undefined;
  const publicKey = query.get("pbk") || undefined;
  const shortId = query.get("sid") || undefined;

  if (security === "reality") {
    if (!publicKey) fail("REALITY link is missing the public key (pbk)");
    if (!sni) fail("REALITY link is missing the SNI/server name");
  }

  const profile: Omit<Profile, "id" | "name" | "createdAt"> = {
    protocol: "trojan",
    address: normalizeHost(url.hostname),
    port,
    password,
    security,
    sni,
    fingerprint: query.get("fp") || undefined,
    alpn: query.get("alpn") || undefined,
    allowInsecure: parseBoolean(query.get("allowInsecure") || query.get("insecure")),
    publicKey,
    shortId,
    spiderX: query.get("spx") || undefined,
    network,
    path: query.get("path") || (network === "ws" || network === "xhttp" || network === "httpupgrade" ? "/" : undefined),
    host: query.get("host") || undefined,
    serviceName: query.get("serviceName") || query.get("servicename") || undefined,
    raw: link
  };

  const warnings = validateTransportFields(profile);
  return {
    profile: {
      ...profile,
      id: crypto.randomUUID(),
      name: resolveName(url, profile),
      createdAt: Date.now()
    },
    warnings
  };
}

function parseVmess(link: string): ParsedLink {
  const payload = link.slice("vmess://".length).split("#")[0].trim();
  const json = decodeBase64(payload);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    fail("The VMess link does not contain valid JSON");
  }

  const address = normalizeHost(String(obj.add ?? ""));
  const port = parsePort(String(obj.port ?? ""));
  const uuid = String(obj.id ?? "");
  if (!uuid) fail("The VMess link is missing its UUID");

  const network = normalizeNetwork(obj.net ? String(obj.net) : undefined);
  if (network === "tcp" && String(obj.type ?? "").toLowerCase() === "http") {
    fail("VMess TCP header obfuscation is not supported. Use WebSocket or gRPC instead.");
  }

  const security: Security = String(obj.tls ?? "").toLowerCase() === "tls" ? "tls" : "none";
  const alterId = Number(obj.aid ?? 0);
  const cipher = String(obj.scy ?? "auto").toLowerCase();
  if (!["auto", "aes-128-gcm", "chacha20-poly1305", "none", "zero"].includes(cipher)) {
    fail(`VMess cipher "${obj.scy}" is not supported`);
  }

  const host = obj.host ? String(obj.host) : undefined;
  const path = obj.path ? String(obj.path) : network === "ws" || network === "httpupgrade" || network === "xhttp" ? "/" : undefined;
  const profile: Omit<Profile, "id" | "name" | "createdAt"> = {
    protocol: "vmess",
    address,
    port,
    uuid,
    alterId: Number.isFinite(alterId) ? alterId : 0,
    cipher,
    security,
    sni: obj.sni ? String(obj.sni) : host,
    alpn: obj.alpn ? String(obj.alpn) : undefined,
    fingerprint: obj.fp ? String(obj.fp) : undefined,
    allowInsecure: false,
    network,
    path,
    host,
    serviceName: network === "grpc" ? (path ? path.replace(/^\//, "") : undefined) : undefined,
    raw: link
  };

  const warnings = validateTransportFields(profile);
  if (profile.alterId && profile.alterId > 0) {
    warnings.push("This VMess server uses legacy alterId authentication.");
  }
  const name = String(obj.ps ?? "").trim();
  return {
    profile: {
      ...profile,
      id: crypto.randomUUID(),
      name: (name || `${labelFor("vmess")} ${address}:${port}`).slice(0, 100),
      createdAt: Date.now()
    },
    warnings
  };
}

function parseShadowsocks(link: string): ParsedLink {
  const withoutScheme = link.slice("ss://".length).trim();
  const hashIndex = withoutScheme.indexOf("#");
  const fragment = hashIndex >= 0 ? safeDecode(withoutScheme.slice(hashIndex + 1)).trim() : "";
  let body = hashIndex >= 0 ? withoutScheme.slice(0, hashIndex) : withoutScheme;

  let query = "";
  const queryIndex = body.indexOf("?");
  if (queryIndex >= 0) {
    query = body.slice(queryIndex + 1);
    body = body.slice(0, queryIndex);
  }
  const params = new URLSearchParams(query);
  if (params.has("plugin")) {
    fail("Shadowsocks plugins (for example obfs-local or v2ray-plugin) are not supported yet.");
  }

  body = body.replace(/\/+$/, "");
  let credentials: string;
  let hostPort: string;

  const atIndex = body.lastIndexOf("@");
  if (atIndex >= 0) {
    const userInfo = body.slice(0, atIndex);
    hostPort = body.slice(atIndex + 1);
    const decoded = tryDecodeUserInfo(userInfo);
    credentials = decoded;
  } else {
    let decoded: string;
    try {
      decoded = decodeBase64(body);
    } catch {
      fail("The Shadowsocks link is not valid SIP002 base64");
    }
    const decodedAt = decoded.lastIndexOf("@");
    if (decodedAt < 0) fail("The Shadowsocks link is missing the server address");
    credentials = decoded.slice(0, decodedAt);
    hostPort = decoded.slice(decodedAt + 1);
  }

  const colon = credentials.indexOf(":");
  if (colon < 1) fail("The Shadowsocks link is missing its method or password");
  const method = credentials.slice(0, colon).toLowerCase();
  const password = credentials.slice(colon + 1);
  if (!SS_METHODS.includes(method)) {
    fail(
      `Shadowsocks method "${method}" is not supported. Use an AEAD method such as aes-256-gcm or chacha20-ietf-poly1305.`
    );
  }
  if (!password) fail("The Shadowsocks link is missing its password");

  const { host, port } = splitHostPort(hostPort);
  const profile: Omit<Profile, "id" | "name" | "createdAt"> = {
    protocol: "ss",
    address: host,
    port,
    password,
    cipher: method,
    security: "none",
    network: "tcp",
    raw: link
  };

  return {
    profile: {
      ...profile,
      id: crypto.randomUUID(),
      name: (fragment || `${labelFor("ss")} ${host}:${port}`).slice(0, 100),
      createdAt: Date.now()
    },
    warnings: []
  };
}

function tryDecodeUserInfo(userInfo: string): string {
  const percentDecoded = safeDecode(userInfo);
  if (percentDecoded.includes(":") && percentDecoded.indexOf(":") > 0) {
    return percentDecoded;
  }
  try {
    const decoded = decodeBase64(userInfo);
    if (decoded.includes(":")) return decoded;
  } catch {
    // Fall through to the percent-decoded value.
  }
  if (percentDecoded.includes(":")) return percentDecoded;
  fail("The Shadowsocks link contains invalid credentials");
}

function safeUrl(link: string): URL {
  try {
    return new URL(link);
  } catch {
    fail("This is not a valid share link");
  }
}

export function parseLink(link: string): ParsedLink {
  const trimmed = link.trim();
  if (trimmed.startsWith("vless://")) return parseVless(trimmed);
  if (trimmed.startsWith("vmess://")) return parseVmess(trimmed);
  if (trimmed.startsWith("trojan://")) return parseTrojan(trimmed);
  if (trimmed.startsWith("ss://")) return parseShadowsocks(trimmed);
  fail("Unsupported link type. Use a vless://, vmess://, trojan://, or ss:// link.");
}

export function profileKey(profile: Profile): string {
  return [
    profile.protocol,
    profile.address.toLowerCase(),
    profile.port,
    profile.uuid ?? profile.password ?? "",
    profile.network,
    profile.path ?? "",
    profile.security
  ].join("|");
}

export function parseLinks(text: string): ParseResult {
  const profiles: Profile[] = [];
  const errors: ParseError[] = [];
  const warnings: ParseError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;

    const matches = trimmed.match(/(?:vless|vmess|trojan|ss):\/\/\S+/gi) ?? [];
    if (matches.length === 0) {
      errors.push({
        line: index + 1,
        input: trimmed.slice(0, 160),
        message: "No supported share link found on this line."
      });
      return;
    }

    for (const match of matches) {
      try {
        const parsed = parseLink(match);
        const key = profileKey(parsed.profile);
        if (seen.has(key)) {
          duplicates += 1;
          continue;
        }
        seen.add(key);
        profiles.push(parsed.profile);
        if (parsed.warnings.length > 0) {
          warnings.push({
            line: index + 1,
            input: parsed.profile.name,
            message: parsed.warnings.join(" ")
          });
        }
      } catch (error) {
        errors.push({
          line: index + 1,
          input: match.slice(0, 160),
          message: error instanceof Error ? error.message : "Could not parse this link."
        });
      }
    }
  });

  return { profiles, errors, warnings, duplicates };
}

export function summarizeProfile(profile: Profile): string {
  const transport = profile.network === "tcp" ? "" : ` · ${profile.network}`;
  return `${labelFor(profile.protocol)}${profile.security !== "none" ? ` · ${profile.security.toUpperCase()}` : ""}${transport}`;
}
