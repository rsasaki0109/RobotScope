# Contributing to RobotScope

Thank you for helping build open observability for robots and Physical AI.

## Where to start

1. Read [architecture.md](RobotScope/docs/architecture.md).
2. Run the viewer: `npm install && npm run dev` from the repo root.
3. Pick a **v0.1** item from GitHub Issues (or propose one aligned with the wedge: MCAP + Autoware + RDM).

## Code layout

| Path | Purpose |
|------|---------|
| `packages/robotscope-core` | RDM types, ingest, query |
| `packages/robotscope-viewer` | Web UI |
| `plugins/*` | Domain packs (Autoware, Nav2, …) |
| `schemas/` | JSON Schema for RDM and plugins |
| `agent/` | ROS2 live bridge |

## Conventions

- TypeScript strict mode; match existing formatting in each package.
- Entity paths are semantic; never use raw topic names as primary keys.
- MCAP remains the interchange format — no proprietary containers in v0.1.
- Plugins default to **read-only**; command permissions are opt-in.
- Do not commit secrets, IMEI/serial dumps, or private robot identifiers.

## Pull requests

- One focused change per PR when possible.
- Include a short test plan (commands run, screenshots for UI).
- Update docs if you change RDM schema or plugin manifest.

## License

Contributions are accepted under the same license as the touched files (core: Apache-2.0).
