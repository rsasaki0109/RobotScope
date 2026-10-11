import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const python = process.env.ROBOTSCOPE_PYTHON || "python3";
execFileSync(python, ["sdk/python/examples/record_demo.py", process.argv[2] ?? "packages/robotscope-viewer/public/demo/demo-python.mcap"], { stdio: "inherit", env: { ...process.env, PYTHONPATH: resolve("sdk/python") } });
