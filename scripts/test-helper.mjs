import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(root, "dist", "helper", "browser-xray-helper.exe");
const dataDir = path.join(root, ".tmp", "helper-test");
const results = [];

const profile = {
  id: "test-profile",
  name: "Test Reality",
  protocol: "vless",
  address: "example.com",
  port: 443,
  uuid: "11111111-2222-4333-8444-555555555555",
  encryption: "none",
  flow: "xtls-rprx-vision",
  security: "reality",
  sni: "www.example.com",
  fingerprint: "chrome",
  publicKey: "Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw",
  shortId: "6ba85179e30d4fc2",
  spiderX: "/",
  network: "tcp",
  createdAt: Date.now()
};

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail && !condition ? `: ${detail}` : ""}`);
}

function frame(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function startHelper() {
  const child = spawn(helperPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      BROWSER_XRAY_DATA_DIR: dataDir,
      BROWSER_XRAY_CORE: path.join(root, "dist", "helper", "xray.exe")
    }
  });

  const pending = new Map();
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) break;
      const payload = buffer.subarray(4, 4 + length).toString("utf8");
      buffer = buffer.subarray(4 + length);
      let message;
      try {
        message = JSON.parse(payload);
      } catch (error) {
        console.error("Malformed native message:", payload);
        continue;
      }
      const entry = pending.get(message.id);
      if (!entry) {
        console.error("Unexpected native message:", message);
        continue;
      }
      pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve(message);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  child.on("exit", () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("helper exited"));
    }
    pending.clear();
  });

  function request(cmd, extra = {}, timeoutMs = 30_000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${cmd}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(frame({ id, cmd, ...extra }));
    });
  }

  return { child, request, getStderr: () => stderr };
}

function stopHelper(helper) {
  return new Promise((resolve) => {
    if (helper.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      helper.child.kill("SIGKILL");
      resolve();
    }, 3000);
    helper.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    helper.child.stdin.end();
    helper.child.kill("SIGTERM");
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitForPort(port, expected, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await canConnect(port)) === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

async function main() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });

  check("helper binary exists", existsSync(helperPath), helperPath);
  if (!existsSync(helperPath)) return;

  const first = startHelper();
  try {
    const ping = await first.request("ping");
    check("ping succeeds", ping.ok === true, JSON.stringify(ping));
    check("ping reports helper version", ping.helperVersion === "1.0.0", ping.helperVersion);
    check("ping reports Xray version", ping.xrayVersion === "26.10.21", ping.xrayVersion);
    check("ping reports Windows", String(ping.platform).startsWith("windows/"), ping.platform);

    const initialStatus = await first.request("status");
    check("initial status is stopped", initialStatus.ok && !initialStatus.running, JSON.stringify(initialStatus));

    const connect = await first.request("connect", { profile });
    check("connect succeeds", connect.ok === true, JSON.stringify(connect));
    check("connect returns a loopback port", Number.isInteger(connect.port) && connect.port > 1024, String(connect.port));
    check("connect returns the profile id", connect.profileId === profile.id, connect.profileId);

    if (connect.ok) {
      check("Xray listens on the returned port", await waitForPort(connect.port, true), String(connect.port));

      const status = await first.request("status");
      check("status reports running", status.ok && status.running === true, JSON.stringify(status));
      check("status reports the same port", status.port === connect.port, `${status.port} vs ${connect.port}`);
      check("status reports the same profile", status.profileId === profile.id, status.profileId);

      const state = readJson(path.join(dataDir, "runtime", "state.json"));
      check("state file is written", state.port === connect.port && state.pid === connect.pid, JSON.stringify(state));

      const config = readJson(path.join(dataDir, "runtime", "config.json"));
      check("config uses an HTTP inbound", config.inbounds?.[0]?.protocol === "http");
      check("config listens only on loopback", config.inbounds?.[0]?.listen === "127.0.0.1");
      check("config has the VLESS outbound", config.outbounds?.[0]?.protocol === "vless");
      check("config has REALITY", config.outbounds?.[0]?.streamSettings?.security === "reality");
      check("logs are not written to stdout", first.getStderr().length === 0, first.getStderr());

      const disconnect = await first.request("disconnect");
      check("disconnect succeeds", disconnect.ok === true, JSON.stringify(disconnect));
      check("proxy port closes after disconnect", await waitForPort(connect.port, false), String(connect.port));
      check("state file is removed", !existsSync(path.join(dataDir, "runtime", "state.json")));
    }
  } finally {
    await stopHelper(first);
  }

  const second = startHelper();
  try {
    const connect = await second.request("connect", { profile });
    check("second connect succeeds", connect.ok === true, JSON.stringify(connect));
    if (connect.ok) {
      check("second tunnel is listening", await waitForPort(connect.port, true), String(connect.port));
      second.child.kill();
      const closed = await waitForPort(connect.port, false, 10_000);
      check("job object stops Xray when the helper dies", closed, String(connect.port));
      if (!closed) {
        try {
          const state = readJson(path.join(dataDir, "runtime", "state.json"));
          spawn("taskkill", ["/PID", String(state.pid), "/T", "/F"], { windowsHide: true });
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  } finally {
    second.child.kill();
  }

  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
