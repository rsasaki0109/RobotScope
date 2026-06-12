# Command gateway (v0.8 alpha)

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
# Connect Live → enable "Allow publish" → Zero cmd_vel
```

Demo agent **accepts** publish requests but does not write to ROS (replay-only).

## Native ROS 2 agent

```bash
npm run demo:ros2-agent -- --profile autoware --allow-publish /cmd_vel
```

Viewer: **Connect Live** → check **Allow publish** → **Zero cmd_vel** sends `geometry_msgs/msg/Twist` with all zeros.

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

Client publish (alpha shortcut):

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
- Viewer — command bar **Allow publish** + **Zero cmd_vel**

## Out of scope (v0.8 alpha)

- Service / action gateway
- Arbitrary message editor UI
- Cloud or multi-user auth
- Plugin runtime permission enforcement (`command.publish` manifest flag still documentation-only)

See [known-limitations.md](RobotScope/docs/known-limitations.md).
