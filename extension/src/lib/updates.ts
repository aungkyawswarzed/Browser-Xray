const API_URL = "https://api.github.com/repos/aungkyawswarzed/Browser-Xray/releases/latest";
const RELEASES_URL = "https://github.com/aungkyawswarzed/Browser-Xray/releases/tag/";
export const UPDATE_CACHE_KEY = "githubUpdateCheck";
export const UPDATE_CACHE_MS = 6 * 60 * 60 * 1000;
export const UPDATE_RETRY_MS = 15 * 60 * 1000;

export type ReleaseInfo = { tag: string; version: string; url: string };
export type UpdateCheck = {
  release: ReleaseInfo | null;
  checkedAt: number;
  failed: boolean;
};

function versionParts(value: string): number[] | null {
  if (!/^v?\d+\.\d+(?:\.\d+){0,2}$/i.test(value)) return null;
  const parts = value.replace(/^v/i, "").split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 65535)) return null;
  while (parts.length < 4) parts.push(0);
  return parts;
}

export function isNewerVersion(latest: string, installed: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function releaseFromTag(tag: unknown): ReleaseInfo | null {
  if (typeof tag !== "string" || !versionParts(tag)) return null;
  // Do not trust URLs or HTML received from the API or cached storage.
  return {
    tag,
    version: tag.replace(/^v/i, ""),
    url: RELEASES_URL + encodeURIComponent(tag)
  };
}

export function parseStableRelease(value: unknown): ReleaseInfo | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Record<string, unknown>;
  if (release.draft !== false || release.prerelease !== false) return null;
  return releaseFromTag(release.tag_name);
}

async function readCache(): Promise<UpdateCheck | null> {
  try {
    const value = (await chrome.storage.local.get(UPDATE_CACHE_KEY))[UPDATE_CACHE_KEY];
    if (!value || typeof value !== "object") return null;
    const stored = value as Record<string, unknown>;
    if (typeof stored.checkedAt !== "number" || !Number.isFinite(stored.checkedAt) ||
        stored.checkedAt < 0 || stored.checkedAt > Date.now() ||
        typeof stored.failed !== "boolean") return null;
    const rawRelease = stored.release;
    const release = rawRelease && typeof rawRelease === "object"
      ? releaseFromTag((rawRelease as Record<string, unknown>).tag) : null;
    if (!stored.failed && !release) return null;
    return { release, checkedAt: stored.checkedAt, failed: stored.failed };
  } catch {
    // Storage failures must not affect proxy use or prevent a manual check.
    return null;
  }
}

let pending: Promise<UpdateCheck> | null = null;

export function checkForUpdates(force = false): Promise<UpdateCheck> {
  // Popup mounts and repeated clicks share one in-flight request.
  if (pending) return pending;
  pending = performCheck(force).finally(() => { pending = null; });
  return pending;
}

async function performCheck(force: boolean): Promise<UpdateCheck> {
  const cached = await readCache();
  const ttl = cached?.failed ? UPDATE_RETRY_MS : UPDATE_CACHE_MS;
  if (!force && cached && Date.now() - cached.checkedAt < ttl) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let result: UpdateCheck;
  try {
    const response = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store"
    });
    if (!response.ok) throw new Error("GitHub update check failed");
    const release = parseStableRelease(await response.json());
    if (!release) throw new Error("Invalid stable release");
    result = { release, checkedAt: Date.now(), failed: false };
  } catch {
    // Preserve a previously discovered update while offline/rate-limited.
    result = { release: cached?.release ?? null, checkedAt: Date.now(), failed: true };
  } finally {
    clearTimeout(timer);
  }
  try {
    await chrome.storage.local.set({ [UPDATE_CACHE_KEY]: result });
  } catch {
    // A check can still succeed when caching is unavailable.
  }
  return result;
}
