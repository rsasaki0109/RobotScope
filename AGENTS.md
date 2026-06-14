# AGENTS

## Purpose

RobotScope is an open observability platform for embodied intelligence — ROS2, Autoware, Nav2, MoveIt, VLA, humanoids, and world models on a unified timeline and coordinate frame.

## Scope

- Build offline-first, MCAP-compatible, plugin-first observability for physical AI.
- v0.1 wedge: MCAP playback + ROS2 live + TF + 3D + Autoware-native panels.
- Do not compete head-on with Foxglove (viewer polish), Rerun (generic data layer), or RViz (display clone).
- Keep core viewer, RDM schema, and plugin API fully OSS (Apache-2.0).

## Operating rules

- MCAP is the primary interchange format; no proprietary log format in v0.1.
- Entity paths are semantic (`/robot/ego/localization/pose`), not raw topic names.
- Separate facts from inference in debug reports and notes.
- Prefer minimal, auditable changes aligned with the architecture doc.
- Do not build cloud, fleet dashboard, full NeRF/3DGS renderer, or marketplace in v0.1.

## Delivery standards

- Match existing TypeScript/React/Three.js conventions in `packages/robotscope-viewer`.
- RDM types live in `packages/robotscope-core` and `schemas/`.
- Document findings under `docs/` and `notes/` when investigating robot logs.
- Keep sensitive robot identifiers, keys, and raw dumps out of commits.

## Key paths

| Path | Role |
|------|------|
| `docs/architecture.md` | Master architecture |
| `packages/robotscope-core` | RDM, query API, ingest |
| `packages/robotscope-viewer` | Web UI |
| `plugins/autoware` | Autoware pack |
| `agent` | ROS2 live bridge |
