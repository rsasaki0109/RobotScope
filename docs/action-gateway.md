# Action gateway (v1.2 GA)

Permission-gated **live action goal send** from the viewer to a local ROS 2 agent.

## Safety model

| Layer | Behavior |
|-------|----------|
| **Viewer** | Action UI is **off by default**. User must check **Allow action goals** while connected live. |
| **Agent** | Actions are **allowlisted** via `--allow-action ACTION` (repeatable). No allowlist → read-only gateway. |
| **Protocol** | `command.action_send_goal` / `command.action_result` over existing live WebSocket v0.1 |

MCAP / rosbag2 playback remains **read-only**. Only live agent connections can send action goals.

## Quick start (demo agent)

```bash
# Terminal 1 — demo agent with Fibonacci action allowlist (default npm script)
npm run demo:live-agent

# Terminal 2 — viewer
npm run dev
# Connect Live → Allow action goals → set n → Send Fibonacci
```

Demo agent **accepts** action goals but does not write to ROS (replay-only).

## Fibonacci shortcut (v1.2)

When **Allow action goals** is enabled and `/robotscope/demo/fibonacci` is allowlisted:

- **n** — Fibonacci order (goal field)
- **Send Fibonacci** — sends `example_interfaces/action/Fibonacci` goal
- Response includes `goal_accepted` from agent (goal acceptance only — no result tracking in alpha)

Native ROS agents can allow any Fibonacci-compatible action name.

## Native ROS 2 agent

```bash
npm run demo:ros2-agent -- --profile autoware --allow-action /robotscope/demo/fibonacci
```

Requires a running Fibonacci action server on the allowlisted name (e.g. ROS 2 tutorials).

## Protocol

Session advertises allowlist:

```json
{
  "type": "session",
  "capabilities": {
    "command_action_send_goal": ["/robotscope/demo/fibonacci"]
  }
}
```

Client Fibonacci goal (v1.2):

```json
{
  "type": "command.action_send_goal",
  "action": "/robotscope/demo/fibonacci",
  "schema": "example_interfaces/action/Fibonacci",
  "fibonacci": { "order": 3 }
}
```

Server response:

```json
{
  "type": "command.action_result",
  "ok": true,
  "action": "/robotscope/demo/fibonacci",
  "goal_accepted": true,
  "message": "Fibonacci goal accepted on /robotscope/demo/fibonacci (order=3)"
}
```

## Implementation

- Core — `RobotScope/packages/robotscope-core/src/live/action-gateway.ts`
- Live client — `LiveAgentClient.sendActionGoal()`
- Python agent — `RobotScope/agent/robotscope_agent/bridge.py`
- Viewer — command bar **Allow action goals** + **Send Fibonacci**

## Out of scope (v1.2)

- Action feedback / result tracking UI
- Arbitrary action goal editor
- Cancel / preempt controls
- Plugin runtime permission enforcement

See [known-limitations.md](RobotScope/docs/known-limitations.md).
