# RobotScope

<p align="center">
  <a href="https://rsasaki0109.github.io/RobotScope/?layout=autoware&demo=1">
    <img src="docs/assets/readme-hero.gif" alt="RobotScope Autoware debug layout — MCAP replay, 3D scene, failure recipes, and cross-stack timeline" width="920" />
  </a>
</p>

<p align="center">
  <strong>Open Observability for Robots and Physical AI</strong>
</p>

<p align="center">
  <a href="https://rsasaki0109.github.io/RobotScope/?layout=autoware&demo=1"><img src="https://img.shields.io/badge/demo-live-22c55e?style=flat-square" alt="Live demo" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/core-Apache--2.0-blue?style=flat-square" alt="Core license: Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/version-1.7.0--beta.0-f59e0b?style=flat-square" alt="Version 1.7.0-beta.0" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 20" />
  <img src="https://img.shields.io/badge/PRs-welcome-8b5cf6?style=flat-square" alt="PRs welcome" />
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://rsasaki0109.github.io/RobotScope/?layout=autoware&demo=1">Live demo</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="docs/contributing.md">Contributing</a>
</p>

Debug ROS2, Autoware, Nav2, MoveIt, VLA policies, humanoids, world models, and 3D robot scenes from one open platform.

> RobotScope is not a robot viewer. It is an OSS observability platform that explains what the robot **sensed**, **believed**, **planned**, **commanded**, **learned**, and **remembered** — on the same timeline, coordinate frame, and causality graph.

## What it shows

RobotScope reconstructs the full decision loop of an embodied agent on one timeline:

| | Stage | Example entities | Status |
|---|-------|------------------|--------|
| 👁️ | **Sensed** | LiDAR, camera, IMU, raw `/sensing/*` topics | ✅ shipped |
| 🧠 | **Believed** | Localization pose, TF tree, occupancy grid, perception objects | ✅ shipped |
| 🗺️ | **Planned** | Trajectories, Nav2 paths, MoveIt motion plans, lanelet routes | ✅ shipped |
| 🎮 | **Commanded** | `/cmd_vel`, action goals, service calls (opt-in command gateway) | ✅ shipped |
| 📚 | **Learned** | VLA policy state, world-model rollouts | 🧪 schema-level |
| 💾 | **Remembered** | Maps (Lanelet2 OSM / Boost bin), recorded MCAP, sidecar indexes | ✅ shipped |

*Learned* entities are defined in the RDM data model (`/policy/*`) but don't have dedicated panels yet.

Across the stack, **failure recipes** flag what went wrong (control tracking, phantom stop, localization drift, controller stuck, joint overspeed, scene collision) and pin them to the timeline.

## Why RobotScope

| Tool | Strength | Gap RobotScope fills |
|------|----------|----------------------|
| Foxglove | MCAP replay, flexible panels | Physical AI trace, Autoware-native semantics, fully OSS core |
| Rerun | Multimodal ECS data layer | ROS2-native graph, Autoware/Nav2 daily workflow |
| RViz | ROS 3D standard | Web-native, dataset/replay, AI observability |

**Winning wedge:** ROS2-native + Autoware-native + Physical-AI-native + fully OSS + plugin-first.

We do not compete head-on with Foxglove on viewer polish, Rerun on generic data layers, or RViz display parity alone.

## Quick start

```bash
git clone https://github.com/rsasaki0109/RobotScope.git   # or: git@github.com:rsasaki0109/RobotScope.git
cd RobotScope
npm install
npm run dev                                                # → http://localhost:5173
```

Open an MCAP file from the viewer (drag & drop) or click **Connect Live** for a WebSocket agent.

**Live demo (GitHub Pages):** [Autoware layout + bundled MCAP](https://rsasaki0109.github.io/RobotScope/?layout=autoware&demo=1) — the same MCAP works with `layout=nav2` or `layout=moveit`.

| Layout | Scrub to | Failure recipe |
|--------|----------|----------------|
| `autoware` | ~0.9s / ~1.4s / end | Control tracking / phantom stop / localization drift |
| `nav2` | ~0.5s / ~1.8s | Controller stuck / localization uncertainty |
| `moveit` | ~0.7s / ~1.8s | Joint overspeed / scene collision |

The timeline footer shows **all stack recipes** at the playhead (amber = Autoware, blue = Nav2, purple = MoveIt). Click colored ticks to jump. When recipes are active, the **cross-layout banner** below the command bar lists all stacks — click a chip to switch layout.

### Live agent

See [docs/live-agent.md](docs/live-agent.md) — pick preset **Local demo :8765** in the command bar, or add `?live=1` to auto-connect.

> ⚠️ **Safety:** the command / service / action gateways are **opt-in and allowlisted** — nothing is published unless you explicitly enable it. Use them against demo or controlled systems only.

```bash
# Generate demo recording (TF + odometry + Autoware topics)
node scripts/create-tf-demo.mjs        # → sample_data/demo-scene.mcap

# Terminal 1 — live replay agent
npm run demo:live-agent

# Terminal 2 — viewer
npm run dev                            # Connect Live → ws://127.0.0.1:8765

# Domain layouts
npm run demo:autoware
npm run demo:nav2
npm run demo:moveit
npm run demo:example

# Native ROS2 agent (requires a sourced ROS distro)
npm run demo:ros2-agent -- --profile autoware

# Static GitHub Pages bundle (local preview)
npm run build:pages
npm run preview:pages                  # → http://127.0.0.1:4173/RobotScope/?layout=autoware&demo=1
```

## Repository layout

```
RobotScope/
├── docs/                    Architecture & guides
├── packages/
│   ├── robotscope-core/     RDM schema, query API, MCAP ingest
│   └── robotscope-viewer/   React + Three.js web viewer
├── plugins/
│   ├── autoware/            Autoware-native panels
│   ├── nav2/                Nav2 stack panels
│   ├── moveit/              MoveIt panels
│   └── example/             Third-party plugin template (SDK)
├── schemas/                 RDM & plugin manifest schemas
├── agent/                   ROS2 live bridge (C++/Python)
├── examples/                Layouts & demo configs
└── sample_data/             Sample MCAP fetch scripts
```

## What's new — v1.7.0-beta.0

Lanelet2 Boost binary parsing consolidated for daily map workflows. See the [release notes](docs/release/v1.7.0-beta.0.md) and the full [CHANGELOG.md](CHANGELOG.md).

> _Beta — viewer is usable daily, but the RDM schema and plugin contracts may still change before a v2 GA._

| Layer | Highlight |
|-------|-----------|
| Map | **Boost bin parse** — heuristic boundary extraction + Map panel **(Boost bin)** badge |
| Live (v1.x) | Action gateway — goal send · feedback tracking · cancel · preempt · timeline panel |
| Live (v1.x) | Command gateway — 6-DOF Twist editor · service Trigger calls (allowlisted, opt-in) |
| Map (v0.x) | Lanelet2 OSM sidecar — relations + regulatory elements · RL2D 2D/3D preview |
| Ingest (v0.x) | MCAP + sidecar index · rosbag2 `.db3` / folder bags · live WebSocket |

**Docs:** [Lanelet2 Boost bin guide](docs/lanelet2-boost-bin.md) · [Migration v1.7 alpha → beta](docs/migration/v1.7-alpha-to-beta.md) · [Known limitations](docs/known-limitations.md)

**Out of scope (v1.7 beta):** full lanelet topology · regulatory yield refs · cross-boost portability · cloud / fleet dashboard.

> **Release history:** every alpha/beta/GA from v0.1 onward — with per-release shipped features, docs, and scope boundaries — lives in [CHANGELOG.md](CHANGELOG.md).

## Architecture

See [docs/architecture.md](docs/architecture.md) for the master design document.

Core data model — the **Robot Data Model (RDM)**: Entity + Component + Archetype + Timeline + Frame + Causality.

```
Entity path examples:
/world/map/lanelet2
/robot/ego/localization/pose
/policy/main/vla_state
```

Raw logs stay in **MCAP**. Indexes live in `.robotscope/` sidecar files.

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React, TypeScript, Vite, Zustand |
| 3D | Three.js (WebGL2 primary, WebGPU experimental) |
| Core | TypeScript (Rust migration path for MCAP/index) |
| Agent | C++ rclcpp + WebSocket |
| Storage | MCAP + DuckDB/SQLite sidecar |

## License

- Core, SDK, examples: [Apache-2.0](LICENSE)
- Schemas: CC0 or Apache-2.0 (see `schemas/`)
- Docs: CC-BY-4.0

## Contributing

See [docs/contributing.md](docs/contributing.md). Issues and PRs are welcome.

**Try it first:** open an MCAP and you immediately get a ROS2 + Autoware + policy trace on a fully open core — then bring your own renderer or plugin.
