#!/usr/bin/env node
/** Capture focused README clips from the real Pages UI and bundled demo recordings. */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/assets");
const FPS = 8;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function resolveChrome() {
  for (const name of [process.env.CHROME_PATH, "chromium", "google-chrome", "chromium-browser"].filter(Boolean)) {
    try {
      return execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error("Install Chromium or set CHROME_PATH.");
}

async function waitForServer(url, server) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (server.exitCode != null) throw new Error("Pages preview exited before becoming ready.");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return;
    } catch {
      // Wait for Vite to bind its port.
    }
    await delay(200);
  }
  throw new Error("Pages preview did not start within 60 seconds.");
}

async function stopServer(server) {
  if (server.exitCode != null || server.signalCode != null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  const signal = (name) => {
    try { process.kill(-server.pid, name); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  signal("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (server.exitCode == null && server.signalCode == null) signal("SIGKILL");
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function encode(frames, name) {
  const output = path.join(OUT, `${name}.gif`);
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-framerate", String(FPS), "-i", path.join(frames, "frame-%03d.png"),
    "-filter_complex",
    "scale=450:360:force_original_aspect_ratio=decrease:flags=lanczos,pad=450:360:(ow-iw)/2:(oh-ih)/2:color=0x10141c,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", output,
  ], { stdio: "inherit" });
  const size = fs.statSync(output).size;
  if (size > 1024 * 1024) throw new Error(`${name} exceeds the 1 MiB gallery budget.`);
  console.log(`${name}: ${Math.round(size / 1024)} KiB`);
}

async function capturePython(page, base, frames) {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(`${base}?layout=timeseries&demo=python`);
  await page.locator("[data-scene-ready=true]").waitFor({ timeout: 90_000 });
  const fields = page.getByRole("region", { name: "Numeric fields" });
  const speed = fields.getByRole("button", { name: /\/robot\/demo\/speed · value/ });
  await speed.waitFor();
  if (await speed.getAttribute("aria-pressed") !== "true") await speed.click();
  const selected = page.getByRole("region", { name: "Selected time series" });
  const removeLabels = await selected.getByRole("button", { name: /^Remove / }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  for (const label of removeLabels) {
    if (!label.includes("/robot/demo/speed · value")) await selected.getByRole("button", { name: label, exact: true }).click();
  }
  const plot = page.locator('[class*="plotShell"]').first();
  await plot.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector(".u-over")?.getBoundingClientRect().width > 100);
  await settle(page);
  const area = await plot.locator(".u-over").boundingBox();
  if (!area) throw new Error("Python plot is missing.");
  const values = new Set();
  for (let frame = 0; frame < 64; frame++) {
    const fraction = Math.min(1, Math.max(0, (frame - 8) / 43));
    const x = area.x + 2 + fraction * (area.width - 4);
    const y = area.y + area.height * (0.85 - fraction * 0.7);
    await page.mouse.click(x, y);
    await settle(page);
    values.add(await selected.innerText());
    await plot.screenshot({ path: path.join(frames, `frame-${String(frame).padStart(3, "0")}.png`) });
  }
  if (values.size < 10) throw new Error("Python replay did not update its recorded values.");
}

async function captureIncidents(page, base, frames) {
  await page.setViewportSize({ width: 720, height: 760 });
  await page.goto(`${base}?layout=autoware&demo=incident&incident=phantom-obstacle-stop`);
  const panel = page.getByRole("region", { name: "Incident Explainer", exact: true });
  await panel.getByText("Observed in the recording", { exact: false }).waitFor({ timeout: 90_000 });
  // Expand only the capture viewport's report height; content and interactions stay real.
  await page.addStyleTag({ content: `
    html { font-size: 18px; }
    section[aria-label="Incident Explainer"] > div { height: 432px; max-height: 432px; }
  ` });
  const details = panel.locator('[class*="details"]').first();
  const navigation = panel.getByRole("navigation", { name: "Detected incidents" });
  for (const [index, label] of ["Phantom obstacle stop suspected", "Control tracking failure suspected"].entries()) {
    await navigation.getByRole("button", { name: new RegExp(label, "i") }).first().click();
    await panel.getByRole("heading", { name: label, exact: true }).waitFor();
    await page.waitForFunction(() => {
      const root = document.querySelector('section[aria-label="Incident Explainer"]');
      return root?.querySelector("article") && !root.textContent.includes("Collecting evidence");
    });
    for (let step = 0; step < 32; step++) {
      await details.evaluate((element, progress) => {
        // Hold each scroll position long enough to read the evidence.
        element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight) * (Math.round(progress * 4) / 4);
      }, Math.min(1, Math.max(0, (step - 12) / 12)));
      await settle(page);
      await details.screenshot({ path: path.join(frames, `frame-${String(index * 32 + step).padStart(3, "0")}.png`) });
    }
  }
}

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "robotscope-gallery-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}/RobotScope/`;
  const server = spawn("npm", ["run", "preview:pages", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: path.join(ROOT, "packages/robotscope-viewer"), detached: true, stdio: "ignore",
  });
  let browser;
  try {
    await waitForServer(base, server);
    browser = await chromium.launch({ executablePath: resolveChrome(), args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    page.setDefaultTimeout(30_000);
    for (const [name, capture] of [["readme-python-replay", capturePython], ["readme-incident-evidence", captureIncidents]]) {
      const frames = path.join(temporary, name);
      fs.mkdirSync(frames);
      console.log(`Capturing ${name} from the Pages UI…`);
      await capture(page, base, frames);
      encode(frames, name);
    }
  } finally {
    try {
      await browser?.close();
    } finally {
      await stopServer(server);
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
