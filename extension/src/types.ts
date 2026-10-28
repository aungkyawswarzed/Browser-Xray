export type Protocol = "vless" | "vmess" | "trojan" | "ss";
export type Security = "none" | "tls" | "reality";
export type Network = "tcp" | "ws" | "grpc" | "httpupgrade" | "xhttp";
export type ConnectionPhase = "disconnected" | "connecting" | "connected" | "error";

export interface Profile {
  id: string;
  name: string;
  protocol: Protocol;
  address: string;
  port: number;
  uuid?: string;
  password?: string;
  flow?: string;
  encryption?: string;
  alterId?: number;
  cipher?: string;
  security: Security;
  sni?: string;
  alpn?: string;
  fingerprint?: string;
  allowInsecure?: boolean;
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
  network: Network;
  path?: string;
  host?: string;
  serviceName?: string;
  raw?: string;
  createdAt: number;
}

export interface ParsedLink {
  profile: Profile;
  warnings: string[];
}

export interface ParseError {
  line: number;
  input: string;
  message: string;
}

export interface ParseResult {
  profiles: Profile[];
  errors: ParseError[];
  warnings: ParseError[];
  duplicates: number;
}

export interface ConnectionState {
  phase: ConnectionPhase;
  profileId?: string;
  port?: number;
  connectedAt?: number;
  error?: string;
  proxyApplied?: boolean;
}

export interface HelperInfo {
  available: boolean;
  version?: string;
  xrayVersion?: string;
  dataDir?: string;
  helperPath?: string;
  xrayPath?: string;
  platform?: string;
  error?: string;
}

export interface AppState {
  connection: ConnectionState;
  profiles: Profile[];
  selectedProfileId: string | null;
  helper: HelperInfo;
  lastProxyError?: string;
  bypassList: string[];
  restartNotice: boolean;
}

export type BackgroundRequest =
  | { type: "getState" }
  | { type: "connect"; profileId: string }
  | { type: "disconnect" }
  | { type: "testExit" }
  | { type: "refreshHelper" }
  | { type: "openDataDir" }
  | { type: "diagnostics" }
  | { type: "setBypassList"; bypassList: string[] }
  | { type: "dismissRestartNotice" };

export type BackgroundResponse =
  | { ok: true; state?: AppState; exitIp?: string; diagnostics?: string }
  | { ok: false; error: string };

export interface NativeResponse {
  ok: boolean;
  error?: string;
  code?: string;
  id?: number;
  helperVersion?: string;
  xrayVersion?: string;
  dataDir?: string;
  helperPath?: string;
  xrayPath?: string;
  platform?: string;
  port?: number;
  pid?: number;
  profileId?: string;
  running?: boolean;
  diagnostics?: string;
}

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  ss: "Shadowsocks"
};
