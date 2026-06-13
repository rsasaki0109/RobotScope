# Service gateway (v1.1 GA)

Permission-gated **live service calls** from the viewer to a local ROS 2 agent.

## Safety model

| Layer | Behavior |
|-------|----------|
| **Viewer** | Service UI is **off by default**. User must check **Allow service calls** while connected live. |
| **Agent** | Services are **allowlisted** via `--allow-service SERVICE` (repeatable). No allowlist → read-only gateway. |
| **Protocol** | `command.service_call` / `command.service_result` over existing live WebSocket v0.1 |

MCAP / rosbag2 playback remains **read-only**. Only live agent connections can call services.

## Quick start (demo agent)

```bash
# Terminal 1 — demo agent with Trigger service allowlist (default npm script)
npm run demo:live-agent

# Terminal 2 — viewer
npm run dev
# Connect Live → Allow service calls → Call trigger
```

Demo agent **accepts** service calls but does not write to ROS (replay-only).

## Trigger shortcut (v1.1)

When **Allow service calls** is enabled and `/robotscope/demo/trigger` is allowlisted:

- **Call trigger** — sends empty `std_srvs/srv/Trigger` request
- Response includes `success` + `message` from agent

Native ROS agents can allow any Trigger-compatible service name.

## Native ROS 2 agent

```bash
npm run demo:ros2-agent -- --profile autoware --allow-service /robotscope/demo/trigger
```

## Protocol

Session advertises allowlist:

```json
{
  "type": "session",
  "capabilities": {
    "command_service_call": ["/robotscope/demo/trigger"]
  }
}
```

Client Trigger call (v1.1):

```json
{
  "type": "command.service_call",
  "service": "/robotscope/demo/trigger",
  "schema": "std_srvs/srv/Trigger",
  "trigger": true
}
```

Server response:

```json
{
  "type": "command.service_result",
  "ok": true,
  "service": "/robotscope/demo/trigger",
  "success": true,
  "message": "Called /robotscope/demo/trigger"
}
```

## Implementation

- Core — `RobotScope/packages/robotscope-core/src/live/service-gateway.ts`
- Live client — `LiveAgentClient.callService()`
- Python agent — `RobotScope/agent/robotscope_agent/bridge.py`
- Viewer — command bar **Allow service calls** + **Call trigger**

## Out of scope (v1.1)

- Arbitrary service request editor UI
- Action gateway
- Plugin runtime permission enforcement

See [known-limitations.md](RobotScope/docs/known-limitations.md).
