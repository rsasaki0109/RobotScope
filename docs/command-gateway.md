# Command gateway (v1.0 beta)

Permission-gated **live publish** from the viewer to a local ROS 2 agent.

## Safety model

| Layer | Behavior |
|-------|----------|
| **Viewer** | Publish UI is **off by default**. User must check **Allow publish** while connected live. |
| **Agent** | Topics are **allowlisted** via `--allow-publish TOPIC` (repeatable). No allowlist → read-only gateway. |
| **Protocol** | `command.publish` / `command.publish_result` over existing live WebSocket v0.1 |

MCAP / rosbag2 playback remains **read-only**. Only live agent connections can publish.

## Quick start (demo agent)

```bash
# Terminal 1 — demo agent with /cmd_vel allowlist (default npm script)
npm run demo:live-agent

# Terminal 2 — viewer
npm run dev
# Connect Live → Allow publish → set vx/vy/vz/ωx/ωy/ωz → Publish cmd_vel
```

Demo agent **accepts** publish requests but does not write to ROS (replay-only).

## Twist velocity editor (v1.0 beta)

When **Allow publish** is enabled and `/cmd_vel` is allowlisted:

- **vx / vy / vz** — linear.x / linear.y / linear.z (m/s)
- **ωx / ωy / ωz** — angular.x / angular.y / angular.z (rad/s)
- **Publish cmd_vel** — sends configured full Twist
- **Zero cmd_vel** — shortcut for all six components at zero

v0.9 clients may still send only `linear_x` / `angular_z`; agents default missing fields to zero.

## Native ROS 2 agent

```bash
npm run demo:ros2-agent -- --profile autoware --allow-publish /cmd_vel
```

## Protocol

Session advertises allowlist:

```json
{
  "type": "session",
  "capabilities": {
    "command_publish": ["/cmd_vel"]
  }
}
```

Client publish with full velocity (v1.0 beta):

```json
{
  "type": "command.publish",
  "topic": "/cmd_vel",
  "schema": "geometry_msgs/msg/Twist",
  "twist": {
    "linear_x": 0.2,
    "linear_y": 0.0,
    "linear_z": 0.0,
    "angular_x": 0.0,
    "angular_y": 0.0,
    "angular_z": -0.1
  }
}
```

Zero shortcut (still supported):

```json
{
  "type": "command.publish",
  "topic": "/cmd_vel",
  "schema": "geometry_msgs/msg/Twist",
  "zero_twist": true
}
```

Server response:

```json
{
  "type": "command.publish_result",
  "ok": true,
  "topic": "/cmd_vel",
  "message": "Published to /cmd_vel"
}
```

## Implementation

- Core — `RobotScope/packages/robotscope-core/src/live/command-gateway.ts`
- Live client — `LiveAgentClient.publishCommand()`
- Python agent — `RobotScope/agent/robotscope_agent/gateway.py`
- Viewer — command bar **Allow publish** + six-axis velocity inputs + **Publish cmd_vel**

## Out of scope (v1.0 beta)

- Service / action gateway
- Arbitrary message editor UI
- Plugin runtime permission enforcement

See [known-limitations.md](RobotScope/docs/known-limitations.md).
