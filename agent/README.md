# robotscope-agent

ROS2 live bridge for RobotScope. Streams topics to the viewer over WebSocket (`robotscope.live.v0.1`).

## v0.1 status

| Component | Status |
|-----------|--------|
| WebSocket protocol | `@robotscope/core` |
| Viewer Connect Live + Record | `@robotscope/viewer` |
| MCAP replay agent | `scripts/live-agent-demo.mjs` |
| **Native ROS 2 agent (Python)** | `agent/robotscope_agent` |

## Native ROS 2 agent

Requires ROS 2 **Humble** or **Jazzy** with `rclpy` and `python3-websockets`.

```bash
cd RobotScope

# Default profile (/tf, /tf_static)
./scripts/run-ros2-agent.sh

# Autoware topic pack
./scripts/run-ros2-agent.sh --profile autoware

# Discover up to 48 topics on the graph (retries as publishers appear)
./scripts/run-ros2-agent.sh --discover

# Retry pending profile topics every 2s (default)
./scripts/run-ros2-agent.sh --profile autoware --topic-retry-sec 2

# Explicit topics
./scripts/run-ros2-agent.sh --topics /tf,/scene/image
```

Viewer: **Connect Live** → `ws://127.0.0.1:8765`

Connection status in the command bar:

| Indicator | Meaning |
|-----------|---------|
| Blue pulse | Connecting |
| Amber pulse | Connected, waiting for ROS topics (`waiting_for_topics`) |
| Green | Streaming |
| Gray | Offline / disconnected |

The agent retries profile topics every `--topic-retry-sec` (default 2s) and pushes new channels to already-connected clients.

### colcon install (optional)

```bash
source /opt/ros/jazzy/setup.bash
cd RobotScope/agent
colcon build --symlink-install
source install/setup.bash
ros2 run robotscope_agent agent --profile nav2
```

## Demo without ROS 2

```bash
npm run demo:live-agent   # replays sample_data/demo-scene.mcap
npm run dev
```

## Profiles

| `--profile` | Topics |
|-------------|--------|
| `default` | `/tf`, `/tf_static` |
| `autoware` | localization, planning, control errors, TF |
| `nav2` | AMCL, costmap, plans, goal, cmd_vel, TF |
| `moveit` | joint states, planning scene, trajectory, TF |

## Live → MCAP recording

In the viewer: **Record Live** → **Stop & Save MCAP** (downloads + reloads for offline scrubbing).

Each recording includes a **sidecar index** (topic timestamps) built during capture.

**Stop & Save MCAP** downloads two files:

| File | Example |
|------|---------|
| MCAP | `robotscope-live-….mcap` |
| Sidecar | `robotscope-live-….mcap.robotscope-index.json` |

On reload, RobotScope uses the sidecar to skip a full MCAP topic scan. The sidecar is also cached in the browser (IndexedDB). To reopen later, select **both** files in **Open MCAP** (multi-select).

CLI equivalent:

```bash
node scripts/write-sidecar.mjs recording.mcap
# → recording.mcap.robotscope/index.json
```

## Security

Publish / service / action gateways are **disabled** in v0.1 (read-only observability). v0.8 alpha adds opt-in **`--allow-publish`** for live agents — see [docs/command-gateway.md](RobotScope/docs/command-gateway.md).
