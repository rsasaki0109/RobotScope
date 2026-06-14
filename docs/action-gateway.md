# Action gateway (v1.5 beta)

Permission-gated **live action goal send and cancel** from the viewer to a local ROS 2 agent, with **Fibonacci feedback / outcome tracking** (v1.3 GA) and **Action timeline panel** (v1.5 beta).

## Safety model

| Layer | Behavior |
|-------|----------|
| **Viewer** | Action UI is **off by default**. User must check **Allow action goals** while connected live. |
| **Agent** | Actions are **allowlisted** via `--allow-action ACTION` (repeatable). No allowlist → read-only gateway. |
| **Protocol** | `command.action_send_goal` / `command.action_result` / `command.action_feedback` / `command.action_outcome` / `command.action_cancel_goal` / `command.action_cancel_result` over live WebSocket v0.1 |

MCAP / rosbag2 playback remains **read-only**. Only live agent connections can send action goals.

## Quick start (demo agent)

```bash
# Terminal 1 — demo agent with Fibonacci action allowlist (default npm script)
npm run demo:live-agent

# Terminal 2 — viewer
npm run dev
# Connect Live → Allow action goals → set n → Send Fibonacci
# Command bar shows running sequence → succeeded
```

Demo agent **accepts** action goals but does not write to ROS (replay-only).

## Fibonacci shortcut (v1.2+)

When **Allow action goals** is enabled and `/robotscope/demo/fibonacci` is allowlisted:

- **n** — Fibonacci order (goal field)
- **Send Fibonacci** — sends `example_interfaces/action/Fibonacci` goal
- **Tracking (v1.3)** — command bar shows `running · [0, 1, …]` then final `succeeded` / `aborted` / `canceled`
- **Cancel (v1.4)** — **Cancel goal** button while status is `running`

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

Client Fibonacci goal:

```json
{
  "type": "command.action_send_goal",
  "action": "/robotscope/demo/fibonacci",
  "schema": "example_interfaces/action/Fibonacci",
  "fibonacci": { "order": 3 }
}
```

Goal acceptance response:

```json
{
  "type": "command.action_result",
  "ok": true,
  "action": "/robotscope/demo/fibonacci",
  "goal_accepted": true,
  "message": "Fibonacci goal accepted on /robotscope/demo/fibonacci (order=3)"
}
```

Feedback stream (v1.3):

```json
{
  "type": "command.action_feedback",
  "action": "/robotscope/demo/fibonacci",
  "sequence": [0, 1, 1]
}
```

Final outcome (v1.3):

```json
{
  "type": "command.action_outcome",
  "action": "/robotscope/demo/fibonacci",
  "ok": true,
  "status": "succeeded",
  "sequence": [0, 1, 1, 2],
  "message": "Fibonacci succeeded on /robotscope/demo/fibonacci"
}
```

Cancel request (v1.4):

```json
{
  "type": "command.action_cancel_goal",
  "action": "/robotscope/demo/fibonacci"
}
```

Cancel response (v1.4):

```json
{
  "type": "command.action_cancel_result",
  "ok": true,
  "action": "/robotscope/demo/fibonacci",
  "cancel_accepted": true,
  "message": "Cancel requested on /robotscope/demo/fibonacci"
}
```

## Implementation

- Core — `RobotScope/packages/robotscope-core/src/live/action-gateway.ts`
- Live client — `LiveAgentClient.sendActionGoal()`
- Python agent — `RobotScope/agent/robotscope_agent/bridge.py`
- Viewer — command bar **Allow action goals** + **Send Fibonacci** + **Cancel goal** + **sequence tracking badge**
- Sidebar — **Action timeline** panel (v1.5) with goal / feedback / outcome / cancel events

## Out of scope (v1.5 beta)

- Cross-session action history persistence
- Preempt controls (send new goal while running)
- Arbitrary action goal editor
- Plugin runtime permission enforcement

See [known-limitations.md](RobotScope/docs/known-limitations.md).
