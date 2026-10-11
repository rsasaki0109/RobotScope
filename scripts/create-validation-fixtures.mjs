/** Additional ignored recordings for browser compression regression tests. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as zstdModule from "@foxglove/wasm-zstd";
import { compressedRecording, lz4Frame } from "../packages/robotscope-core/test/helpers/compressed-fixture.mjs";

const out = resolve(process.argv[2] ?? "packages/robotscope-viewer/public/demo");
mkdirSync(out, { recursive: true });
const zstd = zstdModule.default ?? zstdModule;
await zstd.isLoaded;
writeFileSync(resolve(out, "validation-zstd.mcap"), await compressedRecording("zstd", (data) => zstd.compress(data)));
writeFileSync(resolve(out, "validation-lz4.mcap"), await compressedRecording("lz4", lz4Frame));
console.log(`Created Zstandard and LZ4 validation recordings in ${out}`);
