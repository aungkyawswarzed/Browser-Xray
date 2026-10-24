import { describe, expect, it } from "vitest";
import { parseLink, parseLinks } from "./parser";

const REALITY_LINK =
  "vless://11111111-2222-4333-8444-555555555555@example.com:443?encryption=none&security=reality&sni=www.example.com&fp=chrome&pbk=Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw&sid=6ba85179e30d4fc2&spx=%2F&type=tcp&flow=xtls-rprx-vision#My%20Reality";

describe("parseLink", () => {
  it("parses a VLESS REALITY link", () => {
    const { profile } = parseLink(REALITY_LINK);
    expect(profile.protocol).toBe("vless");
    expect(profile.address).toBe("example.com");
    expect(profile.port).toBe(443);
    expect(profile.security).toBe("reality");
    expect(profile.sni).toBe("www.example.com");
    expect(profile.publicKey).toBe("Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw");
    expect(profile.shortId).toBe("6ba85179e30d4fc2");
    expect(profile.flow).toBe("xtls-rprx-vision");
    expect(profile.name).toBe("My Reality");
  });

  it("parses a VLESS WebSocket link", () => {
    const { profile } = parseLink(
      "vless://11111111-2222-4333-8444-555555555555@example.com:443?encryption=none&security=tls&sni=example.com&type=ws&host=cdn.example.com&path=%2Fwebsocket#WS"
    );
    expect(profile.network).toBe("ws");
    expect(profile.path).toBe("/websocket");
    expect(profile.host).toBe("cdn.example.com");
  });

  it("rejects an unknown transport", () => {
    expect(() =>
      parseLink("vless://11111111-2222-4333-8444-555555555555@example.com:443?type=http")
    ).toThrow(/not supported/i);
  });

  it("rejects REALITY without a public key", () => {
    expect(() =>
      parseLink(
        "vless://11111111-2222-4333-8444-555555555555@example.com:443?security=reality&sni=example.com"
      )
    ).toThrow(/public key/i);
  });

  it("parses a VMess link", () => {
    const payload = {
      v: "2",
      ps: "VMess Server",
      add: "vmess.example.com",
      port: "8443",
      id: "11111111-2222-4333-8444-555555555555",
      aid: "0",
      scy: "auto",
      net: "grpc",
      type: "none",
      host: "",
      path: "vmess-grpc",
      tls: "tls",
      sni: "vmess.example.com"
    };
    const encoded = btoa(JSON.stringify(payload));
    const { profile } = parseLink(`vmess://${encoded}`);
    expect(profile.protocol).toBe("vmess");
    expect(profile.network).toBe("grpc");
    expect(profile.security).toBe("tls");
    expect(profile.serviceName).toBe("vmess-grpc");
    expect(profile.name).toBe("VMess Server");
  });

  it("parses a Trojan gRPC link", () => {
    const { profile } = parseLink(
      "trojan://secret@example.com:443?security=tls&sni=example.com&type=grpc&serviceName=trojan-grpc#Trojan"
    );
    expect(profile.protocol).toBe("trojan");
    expect(profile.password).toBe("secret");
    expect(profile.serviceName).toBe("trojan-grpc");
  });

  it("parses both SIP002 Shadowsocks formats", () => {
    const userInfo = btoa("aes-256-gcm:secret");
    const first = parseLink(`ss://${userInfo}@example.com:8388#SS%20One`).profile;
    expect(first.protocol).toBe("ss");
    expect(first.cipher).toBe("aes-256-gcm");
    expect(first.password).toBe("secret");
    expect(first.name).toBe("SS One");

    const full = btoa("chacha20-ietf-poly1305:pa:ss@example.com:8389");
    const second = parseLink(`ss://${full}#SS%20Two`).profile;
    expect(second.address).toBe("example.com");
    expect(second.port).toBe(8389);
    expect(second.password).toBe("pa:ss");
    expect(second.name).toBe("SS Two");
  });

  it("rejects Shadowsocks plugins", () => {
    expect(() =>
      parseLink("ss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388?plugin=obfs-local%3Bobfs%3Dhttp#SS")
    ).toThrow(/plugin/i);
  });

  it("parses an IPv6 address", () => {
    const { profile } = parseLink(
      "vless://11111111-2222-4333-8444-555555555555@[2001:db8::1]:443?security=tls&sni=example.com#IPv6"
    );
    expect(profile.address).toBe("2001:db8::1");
  });

  it("deduplicates repeated links", () => {
    const result = parseLinks(`${REALITY_LINK}\n${REALITY_LINK}`);
    expect(result.profiles).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("reports bad lines without discarding good ones", () => {
    const result = parseLinks(`not a link\n${REALITY_LINK}\nss://bad`);
    expect(result.profiles).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
