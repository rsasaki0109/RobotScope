#!/usr/bin/env node
/**
 * Build `.robotscope/index.json` sidecar next to an MCAP file (CLI/desktop).
 * Usage: node scripts/write-sidecar.mjs path/to/recording.mcap
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { openMcap, serializeSidecarManifest, sidecarPathForMcap } from "../packages/robotscope-core/dist/index.js";

const mcapPath = resolve(process.argv[2] ?? "");
if (!mcapPath) {
  console.error("Usage: node scripts/write-sidecar.mjs path/to/recording.mcap");
  process.exit(1);
}

const data = readFileSync(mcapPath);
const handle = await openMcap(data, {
  onProgress: (p) => {
    if (p.message) {
      process.stdout.write(`\r${p.message}`);
    }
  },
});

if (!("getSidecarManifest" in handle.engine)) {
  throw new Error("Expected McapQueryEngine");
}

const manifest = handle.engine.getSidecarManifest();
manifest.fingerprint = {
  name: mcapPath.split("/").pop() ?? mcapPath,
  size: data.byteLength,
};

const sidecarPath = sidecarPathForMcap(mcapPath);
mkdirSync(dirname(sidecarPath), { recursive: true });
writeFileSync(sidecarPath, serializeSidecarManifest(manifest));
console.log(`\nWrote ${sidecarPath}`);
