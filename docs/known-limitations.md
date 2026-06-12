# Known limitations (v0.1 beta)

Concrete scope boundaries for **0.1.0-rc.0**. These are product choices or not-yet-built features — not necessarily bugs.

Plugin manifest **`api: "0.1"`** is frozen at RC — see [api-v0.1.md](RobotScope/docs/api-v0.1.md).

## Data & ingest

| Limitation | Workaround |
|------------|------------|
| **rosbag2 SQLite** not read natively | Convert to MCAP first |
| **Proprietary log formats** unsupported | Export to MCAP |
| Large MCAP files index in-browser | Use sidecar JSON (`scripts/write-sidecar.mjs`); re-index cached in `.robotscope/` |
| Live agent requires local WebSocket | Run `npm run demo:live-agent` or ROS2 agent on your machine |

## Visualization

| Limitation | Notes |
|------------|-------|
| **Lanelet2** — stats + **2D panel preview** + centerline polylines + **RL2D demo bin** boundaries in 3D | Full Autoware `lanelet2_io` binary not parsed |
| **Occupancy grid** — 2D preview + 3D mesh | No full costmap plugin parity with RViz |
| **Point clouds** — basic decode + scene | No advanced filtering / accumulation UI |
| **WebGPU** experimental | WebGL2 is the default render path |

## Plugins & failure recipes

| Limitation | Notes |
|------------|-------|
| Failure recipes are **heuristic** | Pattern matchers for daily debug, not root-cause diagnosis |
| Recipe YAML in profiles is **documentation** | Runtime evaluators live in TypeScript plugin code |
| Panel highlight applies to **active layout dock** | Timeline strip shows all stacks; right column is layout-specific |
| MoveIt / Nav2 panels are **v0.1 skeleton+** | Fewer panels than Autoware; recipes demonstrate the pattern |

## Operations

| Limitation | Notes |
|------------|-------|
| **Read-only observability** | No command publish / service call gateway |
| **No cloud / fleet dashboard** | Single-session web viewer |
| **No multi-user auth** | Local or static deploy only |
| GitHub Pages is **static demo** | Live connect targets `localhost` agent |

## Agent

| Limitation | Notes |
|------------|-------|
| Python ROS2 agent is primary | C++ agent path documented but not required for beta |
| Topic profiles are **best-effort lists** | First matching topic wins per semantic slot |
| No automatic discovery of all ROS graph | Profiles + entity mapper rules |

## Reporting issues

Prefer reproducible steps: MCAP snippet or `?layout=…&demo=1` timestamp, layout id, and which failure recipe you expected.

See [CHANGELOG.md](RobotScope/CHANGELOG.md) for fixed vs new work each release.
