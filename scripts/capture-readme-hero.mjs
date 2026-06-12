#!/usr/bin/env node
/**
 * Capture README hero assets from the GitHub Pages build (real UI, not mockups).
 *
 * Outputs:
 *   docs/assets/readme-hero.png  — Autoware layout @ ~1.4s (phantom obstacle recipe)
 *   docs/assets/readme-hero.gif  — scrub loop across failure-recipe windows
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER = path.join(ROOT, "packages/robotscope-viewer");
const OUT_DIR = path.join(ROOT, "docs/assets");
const FRAMES_DIR = path.join(OUT_DIR, "readme-frames");
const PREVIEW_URL = "http://127.0.0.1:4173/RobotScope/?layout=autoware&demo=1";
const VIEWPORT = { width: 1440, height: 900 };

async function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        return;
      }
    } catch {
      // preview still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startPreview() {
  return spawn(
    "npm",
    ["run", "preview:pages", "--", "--host", "127.0.0.1", "--port", "4173"],
    {
      cwd: VIEWER,
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    },
  );
}

async function seekToSeconds(page, seconds) {
  await page.evaluate((sec) => {
    const slider = document.querySelector('footer input[type="range"]');
    if (!(slider instanceof HTMLInputElement)) {
      throw new Error("Timeline slider not found");
    }
    const start = Number(slider.min);
    const end = Number(slider.max);
    const target = Math.min(end, start + sec * 1e9);
    slider.value = String(target);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  }, seconds);
}

async function waitForDemoReady(page) {
  await page.waitForSelector('footer input[type="range"]', { timeout: 90_000 });
  await page.waitForFunction(
    () => {
      const status = document.querySelector("header p")?.textContent ?? "";
      return status.includes("Loaded") || status.includes("failure recipe");
    },
    { timeout: 90_000 },
  );
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const preview = startPreview();
  preview.stdout?.on("data", () => {});
  preview.stderr?.on("data", () => {});

  try {
    await waitForHttp("http://127.0.0.1:4173/RobotScope/");

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(PREVIEW_URL, { waitUntil: "networkidle" });
    await waitForDemoReady(page);

    const scrubSeconds = [0.55, 0.95, 1.45, 1.85];
    for (let index = 0; index < scrubSeconds.length; index += 1) {
      await seekToSeconds(page, scrubSeconds[index]);
      await page.waitForTimeout(900);
      await page.screenshot({
        path: path.join(FRAMES_DIR, `frame-${String(index).padStart(2, "0")}.png`),
        fullPage: false,
      });
    }

    await seekToSeconds(page, 1.45);
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(OUT_DIR, "readme-hero.png"),
      fullPage: false,
    });

    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        "0.45",
        "-i",
        path.join(FRAMES_DIR, "frame-%02d.png"),
        "-vf",
        "scale=920:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
        path.join(OUT_DIR, "readme-hero.gif"),
      ],
      { stdio: "inherit" },
    );

    await browser.close();
    console.log("Wrote docs/assets/readme-hero.png and readme-hero.gif");
  } finally {
    preview.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
