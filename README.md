# RobotScope

**Open Observability for Robots and Physical AI**

Debug ROS2, Autoware, Nav2, MoveIt, VLA policies, humanoids, world models, and 3D robot scenes from one open platform.

> RobotScope is not a robot viewer. It is an OSS observability platform that explains what the robot **sensed**, **believed**, **planned**, **commanded**, **learned**, and **remembered** — on the same timeline, coordinate frame, and causality graph.

## Why RobotScope

| Tool | Strength | Gap RobotScope fills |
|------|----------|----------------------|
| Foxglove | MCAP replay, flexible panels | Physical AI trace, Autoware-native semantics, fully OSS core |
| Rerun | Multimodal ECS data layer | ROS2-native graph, Autoware/Nav2 daily workflow |
| RViz | ROS 3D standard | Web-native, dataset/replay, AI observability |

**Winning wedge (v0.1):** ROS2-native + Autoware-native + Physical-AI-native + fully OSS + plugin-first.

Do not compete head-on with Foxglove on viewer polish, Rerun on generic data layers, or RViz display parity alone.

## Quick start

```bash
git clone git@github.com:rsasaki0109/RobotScope.git
cd RobotScope
npm install
npm run dev
```

Open an MCAP file from the viewer (drag & drop) or click **Connect Live** for a WebSocket agent.

**Live demo (GitHub Pages):** [Autoware layout + bundled MCAP](https://rsasaki0109.github.io/RobotScope/?layout=autoware&demo=1) — same MCAP works with `layout=nav2` or `layout=moveit`.

| Layout | Scrub to | Failure recipe |
|--------|----------|----------------|
| `autoware` | ~0.9s / ~1.4s / end | Control tracking / phantom stop / localization drift |
| `nav2` | ~0.5s / ~1.8s | Controller stuck / localization uncertainty |
| `moveit` | ~0.7s / ~1.8s | Joint overspeed / scene collision |

The timeline footer shows **all stack recipes** at the playhead (amber = Autoware, blue = Nav2, purple = MoveIt). Click colored ticks to jump.

```bash
# Generate demo recording (TF + odometry + Autoware topics)
node scripts/create-tf-demo.mjs
# → sample_data/demo-scene.mcap

# Terminal 1 — live replay agent
npm run demo:live-agent

# Terminal 2 — viewer
npm run dev
# Connect Live → ws://127.0.0.1:8765
# Domain layouts
npm run demo:autoware
npm run demo:nav2
npm run demo:moveit

# Native ROS2 agent (requires sourced ROS distro)
npm run demo:ros2-agent -- --profile autoware

# Static GitHub Pages bundle (local preview)
npm run build:pages
npm run preview:pages
# → http://127.0.0.1:4173/RobotScope/?layout=autoware&demo=1
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
│   └── moveit/              MoveIt panels
├── schemas/                 RDM & plugin manifest schemas
├── agent/                   ROS2 live bridge (C++/Python)
├── examples/                Layouts & demo configs
└── sample_data/             Sample MCAP fetch scripts
```

## v0.1 alpha (0.1.0-alpha.0)

See [CHANGELOG.md](RobotScope/CHANGELOG.md) and [release notes](RobotScope/docs/release/v0.1.0-alpha.0.md).

**Shipped in this alpha**

- MCAP playback + sidecar topic index (browser cache + `scripts/write-sidecar.mjs`)
- Live WebSocket ingest, follow timeline, **Record Live** → MCAP + sidecar
- TF tree, timeline, 3D scene, raw ROS2 message decode
- Plugin packs: **Autoware**, **Nav2**, **MoveIt** (`?layout=…`)
- Python ROS2 agent with topic profiles
- Physical AI seed types: Observation, Action, VLAState

**Still out of scope (v0.1)**

- Cloud / fleet dashboard
- Command gateway (read-only observability only)
- Full 3DGS / NeRF renderers
- Proprietary log format
- rosbag2 SQLite reader (convert to MCAP first)

## Architecture

See [docs/architecture.md](RobotScope/docs/architecture.md) for the master design document.

Core data model (**RDM**): Entity + Component + Archetype + Timeline + Frame + Causality.

```
Entity path examples:
/world/map/lanelet2
/robot/ego/localization/pose
/policy/main/vla_state
```

Raw logs stay in **MCAP**. Indexes live in `.robotscope/` sidecar files.

## Tech stack (v0.1)

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

See [docs/contributing.md](RobotScope/docs/contributing.md).

**Star hooks:** Open an MCAP → see ROS2 + Autoware + policy trace. Fully open core. Bring your own renderer/plugin.
