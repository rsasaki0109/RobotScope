# Live agent guide

Stream ROS2 topics into RobotScope over WebSocket — no MCAP file required for viewing.

## Quick start (demo replay agent)

No ROS installation needed. Replays the bundled demo MCAP over WebSocket.

```bash
npm install && npm run build:pages   # generates demo MCAP once
npm run demo:live-agent            # Terminal 1 → ws://127.0.0.1:8765
npm run dev                        # Terminal 2
```

In the viewer:

1. Pick layout (e.g. **Autoware**)
2. Preset **Local demo :8765** → **Connect Live**

Or open with auto-connect:

```
http://127.0.0.1:5173/?layout=autoware&live=1
```

## Native ROS2 agent

Requires a sourced ROS 2 distro (Humble or Jazzy):

```bash
npm run demo:ros2-agent -- --profile autoware
# or nav2 / moveit profiles via --profile
```

Then connect the viewer to `ws://127.0.0.1:8765` (default agent port).

## Record live → MCAP

While connected live:

1. **Record Live** — buffers messages in the browser
2. **Stop & Save MCAP** — downloads MCAP + sidecar JSON and reloads playback

## GitHub Pages note

The [hosted demo](https://rsasaki0109.github.io/RobotScope/?layout=autoware&demo=1) replays a **bundled MCAP** (offline). Live connect still targets **your machine**:

- Run `npm run demo:live-agent` locally
- Open Pages or local dev viewer → **Connect Live** → `ws://127.0.0.1:8765`

Browsers cannot reach localhost from a remote origin unless the agent runs on your machine.

## Failure recipes during live

While connected live, the timeline footer evaluates **Autoware, Nav2, and MoveIt** failure recipes at the playhead (green **live** badge). Markers accumulate on the scrub bar as patterns appear — same panel highlighting as MCAP playback in the right dock.

Works with `npm run demo:live-agent` replaying the demo MCAP over WebSocket.

## URL parameters

| Param | Example | Effect |
|-------|---------|--------|
| `demo=1` | `?layout=autoware&demo=1` | Auto-load bundled demo MCAP |
| `live=1` | `?layout=nav2&live=1` | Auto-connect to default live URL |
| `liveUrl` | `?live=1&liveUrl=ws://127.0.0.1:9000` | Override WebSocket URL |

`demo=1` takes priority if both are set.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| **Connecting** forever | Agent running? Port 8765 free? |
| **Waiting for topics** | Agent profile matches your ROS graph |
| Live connect from Pages fails | Expected — run agent locally; use `ws://127.0.0.1:8765` |

See also: `RobotScope/agent/README.md` (if present) and `scripts/run-ros2-agent.sh`.
