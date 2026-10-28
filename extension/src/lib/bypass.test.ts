import { describe, expect, it } from "vitest";
import {
  buildBypassPatterns,
  MAX_BYPASS_ENTRIES,
  normalizeBypassEntry,
  normalizeBypassList
} from "./bypass";

describe("bypass entry normalization", () => {
  it.each([
    ["example.com", "example.com"],
    ["Example.COM.", "example.com"],
    ["*.example.com", "example.com"],
    [".example.com", "example.com"],
    ["example.com:8443", "example.com"],
    ["https://example.com/path?q=1", "example.com"],
    ["https://user:pass@sub.example.com:8443/", "sub.example.com"],
    ["192.168.1.10", "192.168.1.10"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBypassEntry(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "*",
    "example.com/path with spaces",
    "http://",
    "ftp://example.com",
    "javascript:alert(1)",
    "foo_bar.com",
    "-example.com",
    "example..com",
    "256.1.1.1",
    "http://[::1]"
  ])("rejects %j", (input) => {
    expect(normalizeBypassEntry(input)).toBeNull();
  });
});

describe("bypass list", () => {
  it("normalizes, deduplicates, and caps untrusted storage values", () => {
    expect(normalizeBypassList(["Example.com", "example.com", "*.sub.example.com", 42])).toEqual([
      "example.com",
      "sub.example.com"
    ]);
    const many = Array.from({ length: MAX_BYPASS_ENTRIES + 5 }, (_, index) => `site${index}.com`);
    expect(normalizeBypassList(many)).toHaveLength(MAX_BYPASS_ENTRIES);
    expect(normalizeBypassList("example.com")).toEqual([]);
  });

  it("keeps loopback bypassed and includes domains and their subdomains", () => {
    expect(buildBypassPatterns(["example.com", "192.168.1.10"])).toEqual([
      "<local>",
      "localhost",
      "127.0.0.1",
      "[::1]",
      "example.com",
      "*.example.com",
      "192.168.1.10"
    ]);
  });
});
