import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(root, "dist", "helper", "browser-xray-helper.exe");
const xrayPath = path.join(root, "dist", "helper", "xray.exe");
const testDir = path.join(root, ".tmp", "e2e");
const helperDataDir = path.join(testDir, "helper-data");
const results = [];

const uuid = "8f3a7d2c-6b1e-4a9f-9c5d-2e7b8a1f4c60";
const originBody = "local-origin-ok";

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
      BROWSER_XRAY_DATA_DIR: helperDataDir,
      BROWSER_XRAY_CORE: xrayPath
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
      } catch {
        console.error("Malformed native message:", payload);
        continue;
      }
      const entry = pending.get(message.id);
      if (!entry) continue;
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

async function stopHelper(helper) {
  if (!helper || helper.child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    helper.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    helper.child.stdin.end();
    helper.child.kill();
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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
    setTimeout(resolve, 1000).unref();
  });
}

function decodeChunked(body) {
  const chunks = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf("\r\n", offset);
    if (lineEnd < 0) break;
    const size = parseInt(body.subarray(offset, lineEnd).toString("ascii"), 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = lineEnd + 2;
    chunks.push(body.subarray(start, start + size));
    offset = start + size + 2;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function proxyHttp(proxyPort, originPort, requestPath) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: proxyPort });
    let raw = Buffer.alloc(0);
    let settled = false;
    const debug = process.env.DEBUG_E2E === "1";
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => {
      console.error("proxy HTTP timeout; bytes received:", raw.length);
      if (raw.length > 0) console.error(raw.toString("latin1"));
      fail(new Error("proxy HTTP request timed out"));
    }, 15_000);

    socket.once("connect", () => {
      const request =
        `GET http://127.0.0.1:${originPort}${requestPath} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${originPort}\r\n` +
        "Connection: close\r\n\r\n";
      if (debug) console.error("-->", JSON.stringify(request));
      socket.write(request);
    });
    socket.on("data", (chunk) => {
      raw = Buffer.concat([raw, chunk]);
      if (debug) console.error("<--", chunk.toString("latin1"));
      const headerEnd = raw.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const head = raw.subarray(0, headerEnd).toString("latin1");
      const body = raw.subarray(headerEnd + 4);
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(head);
      if (lengthMatch) {
        const length = Number(lengthMatch[1]);
        if (body.length < length) return;
        finish({ head, status: Number(head.split(" ")[1]), body: body.subarray(0, length).toString("utf8") });
        return;
      }
      if (/Transfer-Encoding:\s*chunked/i.test(head)) {
        if (!body.includes("\r\n0\r\n\r\n")) return;
        finish({ head, status: Number(head.split(" ")[1]), body: decodeChunked(body) });
        return;
      }
      finish({ head, status: Number(head.split(" ")[1]), body: body.toString("utf8") });
    });
    socket.on("end", () => {
      if (settled) return;
      const headerEnd = raw.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        fail(new Error(`proxy closed without a response (${raw.length} bytes)`));
        return;
      }
      const head = raw.subarray(0, headerEnd).toString("latin1");
      const start = headerEnd + 4;
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(head);
      const body = lengthMatch ? raw.subarray(start, start + Number(lengthMatch[1])) : raw.subarray(start);
      finish({ head, status: Number(head.split(" ")[1]), body: body.toString("utf8") });
    });
    socket.once("error", fail);
  });
}

function proxyConnect(proxyPort, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: proxyPort });
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("CONNECT timed out"));
    }, 10_000);

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      socket.off("data", onData);
      clearTimeout(timer);
      const head = buffer.subarray(0, headerEnd).toString("latin1");
      if (!/^HTTP\/1\.[01] 200/i.test(head)) {
        socket.destroy();
        reject(new Error(head));
        return;
      }
      resolve({ socket, extra: buffer.subarray(headerEnd + 4) });
    };

    socket.on("data", onData);
    socket.once("connect", () => {
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function echoThroughTunnel(socket, payload, extra) {
  return new Promise((resolve, reject) => {
    if (extra.length > 0) {
      resolve(extra.toString("utf8"));
      return;
    }
    const timer = setTimeout(() => reject(new Error("echo timed out")), 10_000);
    socket.once("data", (chunk) => {
      clearTimeout(timer);
      resolve(chunk.toString("utf8"));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.write(payload);
  });
}

async function startLocalXray(serverPort, configPath, errorLogPath, accessLogPath) {
  const config = {
    log: {
      loglevel: "warning",
      access: accessLogPath,
      error: errorLogPath
    },
    inbounds: [
      {
        listen: "127.0.0.1",
        port: serverPort,
        protocol: "vless",
        settings: {
          clients: [{ id: uuid }],
          decryption: "none"
        },
        streamSettings: {
          network: "tcp",
          security: "none"
        }
      }
    ],
    outbounds: [
      {
        protocol: "freedom",
        settings: {
          finalRules: [
            {
              action: "allow",
              network: "tcp,udp",
              ip: ["127.0.0.0/8", "::1/128"]
            }
          ]
        }
      }
    ]
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const child = spawn(xrayPath, ["run", "-c", configPath], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0 && signal === null) {
      console.error(`local Xray server exited with code ${code}`);
    }
  });

  const ready = await waitForPort(serverPort, true, 10_000);
  return { child, ready, getOutput: () => output };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

async function main() {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(helperDataDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });

  check("helper binary exists", existsSync(helperPath), helperPath);
  check("Xray binary exists", existsSync(xrayPath), xrayPath);
  if (!existsSync(helperPath) || !existsSync(xrayPath)) return;

  let originServer;
  let echoServer;
  let localXray;
  let helper;

  try {
    const originRequests = [];
    originServer = http.createServer((request, response) => {
      originRequests.push({ url: request.url, host: request.headers.host });
      const body = Buffer.from(originBody);
      response.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": String(body.length),
        "Connection": "close"
      });
      response.end(body);
    });
    const originPort = await listen(originServer);

    echoServer = net.createServer((socket) => {
      socket.on("data", (data) => socket.write(data));
      socket.on("error", () => {});
    });    const echoPort = await listen(echoServer);

    const serverPort = await freePort();
    const serverConfigPath = path.join(testDir, "local-server.json");
    const serverErrorLog = path.join(testDir, "local-server-error.log");
    const serverAccessLog = path.join(testDir, "local-server-access.log");
    localXray = await startLocalXray(serverPort, serverConfigPath, serverErrorLog, serverAccessLog);
    check("local VLESS test server is listening", localXray.ready, `port ${serverPort}`);
    if (!localXray.ready) {
      console.error(localXray.getOutput());
      return;
    }

    helper = startHelper();
    const ping = await helper.request("ping");
    check("helper starts", ping.ok === true, JSON.stringify(ping));

    const profile = {
      id: "e2e-local-vless",
      name: "Local VLESS E2E",
      protocol: "vless",
      address: "127.0.0.1",
      port: serverPort,
      uuid,
      encryption: "none",
      security: "none",
      network: "tcp",
      createdAt: Date.now()
    };

    const connect = await helper.request("connect", { profile });
    check("helper connects to the local VLESS server", connect.ok === true, JSON.stringify(connect));
    if (!connect.ok) return;

    check("browser proxy port is listening", await waitForPort(connect.port, true), String(connect.port));
    check("status reports running", (await helper.request("status")).running === true);

    const config = readJson(path.join(helperDataDir, "runtime", "config.json"));
    check("generated config uses a loopback HTTP inbound", config.inbounds?.[0]?.listen === "127.0.0.1" && config.inbounds?.[0]?.protocol === "http");
    check(
      "generated config points at the local VLESS server",
      config.outbounds?.[0]?.protocol === "vless" &&
        config.outbounds?.[0]?.settings?.vnext?.[0]?.address === "127.0.0.1" &&
        config.outbounds?.[0]?.settings?.vnext?.[0]?.port === serverPort
    );

    const first = await proxyHttp(connect.port, originPort, "/e2e-http?first=1");
    check("HTTP request through the proxy succeeds", first.status === 200, first.head);
    check("HTTP body comes from the local origin", first.body === originBody, first.body);
    check("local origin saw the request", originRequests.length === 1 && originRequests[0]?.url === "/e2e-http?first=1", JSON.stringify(originRequests));

    const tunneled = await proxyConnect(connect.port, "127.0.0.1", echoPort);
    const echoed = await echoThroughTunnel(tunneled.socket, "ping-through-xray", tunneled.extra);
    tunneled.socket.destroy();
    check("CONNECT tunnel carries arbitrary TCP", echoed === "ping-through-xray", echoed);

    const second = await proxyHttp(connect.port, originPort, "/e2e-http?second=1");
    check("second HTTP request succeeds", second.status === 200 && second.body === originBody, `${second.status} ${second.body}`);
    check("second request reached the local origin", originRequests.length === 2, JSON.stringify(originRequests));
    check("no helper output polluted stdout", helper.getStderr().length === 0, helper.getStderr());

    const disconnect = await helper.request("disconnect");
    check("disconnect succeeds", disconnect.ok === true, JSON.stringify(disconnect));
    check("proxy port closes after disconnect", await waitForPort(connect.port, false), String(connect.port));
    check("helper remains responsive after disconnect", (await helper.request("ping")).ok === true);
  } catch (error) {
    console.error(error);
    if (localXray) console.error("local Xray output:", localXray.getOutput());
    for (const name of ["local-server-access.log", "local-server-error.log", "helper-data/logs/helper.log", "helper-data/logs/xray.log", "helper-data/logs/xray-error.log"]) {
      const file = path.join(testDir, name);
      if (existsSync(file)) console.error(`--- ${name} ---\n${readFileSync(file, "utf8")}`);
    }
    results.push({ name: "unexpected exception", ok: false, detail: String(error) });
  } finally {
    await stopHelper(helper);
    if (localXray?.child) localXray.child.kill();
    await closeServer(originServer);
    await closeServer(echoServer);
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
