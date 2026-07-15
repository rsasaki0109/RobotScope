#!/usr/bin/env node
/** Generate the README showcase from the real GitHub Pages build. */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER = path.join(ROOT, "packages/robotscope-viewer");
const OUT_DIR = path.join(ROOT, "docs/assets");
const VIEWPORT = { width: 1280, height: 720 };
const SOCIAL_VIEWPORT = { width: 1200, height: 630 };
const FPS = 8;
const DURATION_SECONDS = 10;
const GIF_LIMIT_BYTES = 3 * 1024 * 1024;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process is still starting.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function resolveChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      // Try the next browser.
    }
  }
  throw new Error("Chrome/Chromium not found. Set CHROME_PATH to a compatible browser.");
}

async function stopProcess(child) {
  if (child.exitCode != null || child.signalCode != null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const signal = (name) => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  };
  signal("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (child.exitCode == null && child.signalCode == null) {
    signal("SIGKILL");
    await Promise.race([exited, delay(1_000)]);
  }
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForShowcase(client, timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.send("Runtime.evaluate", {
      expression: 'document.querySelector("[data-showcase-ready=true]") !== null',
      returnByValue: true,
    });
    if (result.result?.value === true) return;
    await delay(250);
  }
  throw new Error("Showcase did not become ready");
}

async function setViewport(client, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function setShowcaseTime(client, elapsedMs) {
  await client.send("Runtime.evaluate", {
    expression: `window.dispatchEvent(new CustomEvent("robotscope:showcase-time", { detail: ${elapsedMs} }))`,
  });
}

async function screenshot(client, outputPath) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  fs.writeFileSync(outputPath, Buffer.from(result.data, "base64"));
}

function encodeAssets(framesDir) {
  const input = path.join(framesDir, "frame-%03d.png");
  const mp4 = path.join(OUT_DIR, "readme-showcase.mp4");
  const gif = path.join(OUT_DIR, "readme-hero.gif");

  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-framerate", String(FPS), "-i", input,
    "-c:v", "libx264", "-preset", "medium", "-crf", "22",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
  ], { stdio: "inherit" });

  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-framerate", String(FPS), "-i", input,
    "-filter_complex",
    "scale=920:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    gif,
  ], { stdio: "inherit" });

  const gifBytes = fs.statSync(gif).size;
  if (gifBytes > GIF_LIMIT_BYTES) {
    throw new Error(`README GIF is ${(gifBytes / 1024 / 1024).toFixed(2)} MiB; limit is 3 MiB`);
  }
  return { gif, gifBytes, mp4, mp4Bytes: fs.statSync(mp4).size };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robotscope-showcase-"));
  const framesDir = path.join(tempDir, "frames");
  const chromeProfile = path.join(tempDir, "chrome");
  fs.mkdirSync(framesDir);

  const previewPort = await freePort();
  const debugPort = await freePort();
  const preview = spawn(
    "npm",
    ["run", "preview:pages", "--", "--host", "127.0.0.1", "--port", String(previewPort)],
    {
      cwd: VIEWER,
      stdio: "pipe",
      detached: process.platform !== "win32",
      env: { ...process.env, BROWSER: "none" },
    },
  );
  const chrome = spawn(resolveChrome(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--hide-scrollbars",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ], { stdio: "ignore", detached: process.platform !== "win32" });

  let client;
  try {
    const baseUrl = `http://127.0.0.1:${previewPort}/RobotScope/`;
    await Promise.all([
      waitForHttp(baseUrl),
      waitForHttp(`http://127.0.0.1:${debugPort}/json/version`),
    ]);

    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
    const page = pages.find((candidate) => candidate.type === "page");
    if (!page) throw new Error("Chrome page target not found");
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await setViewport(client, VIEWPORT);
    await client.send("Page.navigate", {
      url: `${baseUrl}?showcase=phantom-stop&capture=1`,
    });
    await waitForShowcase(client);

    const frameCount = FPS * DURATION_SECONDS;
    for (let index = 0; index < frameCount; index += 1) {
      await setShowcaseTime(client, (index / FPS) * 1000);
      await delay(180);
      await screenshot(client, path.join(framesDir, `frame-${String(index).padStart(3, "0")}.png`));
      if ((index + 1) % FPS === 0) process.stdout.write(`Captured ${(index + 1) / FPS}s / ${DURATION_SECONDS}s\n`);
    }

    await setViewport(client, VIEWPORT);
    await setShowcaseTime(client, 6_200);
    await delay(350);
    await screenshot(client, path.join(OUT_DIR, "readme-hero.png"));

    await setViewport(client, SOCIAL_VIEWPORT);
    await setShowcaseTime(client, 8_600);
    await delay(350);
    await screenshot(client, path.join(OUT_DIR, "readme-social-card.png"));

    const encoded = encodeAssets(framesDir);
    console.log(`Wrote ${path.relative(ROOT, encoded.gif)} (${(encoded.gifBytes / 1024 / 1024).toFixed(2)} MiB)`);
    console.log(`Wrote ${path.relative(ROOT, encoded.mp4)} (${(encoded.mp4Bytes / 1024 / 1024).toFixed(2)} MiB)`);
    console.log("Wrote docs/assets/readme-hero.png and docs/assets/readme-social-card.png");
  } finally {
    client?.close();
    await Promise.all([stopProcess(preview), stopProcess(chrome)]);
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
