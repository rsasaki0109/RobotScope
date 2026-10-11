# Inputs independent of ROS

RobotScope observes robot decisions on shared time and coordinate frames. ROS 2
is one supported input. Python programs, simulators and custom robot software can
record directly using the [Python SDK](../sdk/python/README.md), or generate the
same standard MCAP channel contract. Simulator-specific integrations, ROS 1,
Protobuf and arbitrary binary decoders are not implemented by this change.

## MCAP contract

Use an MCAP file with indexes/summary, channel `messageEncoding: "json"`, UTF-8
JSON messages, and embedded `jsonschema` definitions. Schema-less or custom JSON
channels also support raw inspection and numeric queries. Generic JSON schema
documents are exposed as source definitions; the reader does not run a complete
JSON Schema validator. The built-in payloads below have runtime shape validation.

| Schema name | Payload | Archetype |
| --- | --- | --- |
| `robotscope.Scalar.v1` | `value`, optional `unit` | Observation |
| `robotscope.Observation.v1` | Arbitrary JSON object | Observation |
| `robotscope.Pose.v1` | `frame_id`, `position: [x,y,z]`, `rotation: [x,y,z,w]` | Pose |
| `robotscope.Image.v1` | `frame_id`, `width`, `height`, `encoding`, `data_b64` | Image |
| `robotscope.PointCloud.v1` | `frame_id`, `points: [[x,y,z], ...]` | PointCloud |
| `robotscope.Trajectory.v1` | `frame_id`, `points: [[x,y,z], ...]` | Trajectory |
| `robotscope.Transform.v1` | `parent_frame_id`, `child_frame_id`, `translation`, `rotation`, `is_static` | TF |

Keep stream/topic names separate from semantic identity. Channel metadata selects
the entity explicitly rather than guessing it from ROS topic naming:

```json
{
  "robotscope.entity_path": "/robot/arm/tool",
  "robotscope.archetype": "Pose",
  "robotscope.kind": "robot"
}
```

Entity paths are absolute, with nonempty segments containing letters, digits,
underscores, dots or hyphens; `.` and `..` segments are invalid. Kinds follow RDM:
`world`, `robot`, `sensor`, `policy`, `world_model`, `annotation`, `system`.
The archetype must match the built-in schema. Unmapped JSON remains inspectable
and queryable. This baseline assumes one schema/channel per stream name.

Geometry uses metres, right-handed frames, and unit xyzw quaternions. Images use
tightly packed `rgb8`, `rgba8` or `mono8` bytes encoded as base64. Invalid payloads
produce decode errors instead of guessed geometry. Geometry without a transform
to the chosen fixed frame is omitted with a warning.

## Live adapter contract

The existing `robotscope.live.v0.1` WebSocket session/channel/message protocol
also accepts JSON input. For a JSON channel, set:

```json
{
  "type": "channel",
  "channel": {
    "id": 1,
    "topic": "arm-tool",
    "schema": "robotscope.Pose.v1",
    "encoding": "jsonschema",
    "definition": "{\"type\":\"object\"}",
    "message_encoding": "json",
    "metadata": {
      "robotscope.entity_path": "/robot/arm/tool",
      "robotscope.archetype": "Pose",
      "robotscope.kind": "robot"
    }
  }
}
```

Send a valid session handshake first, then channel definitions, then messages
whose `data_b64` is base64 of the UTF-8 JSON bytes. `log_time_ns` uses a shared
caller-supplied clock. Agents omitting `message_encoding` retain the existing
ROS 2 CDR behavior; ROS inputs therefore remain compatible. Recording preserves
the channel encoding and metadata so that reopening applies the same mapping.
Command capabilities remain opt-in, and are absent from the generic replay.

Run a non-ROS replay adapter after generating the Python demo:

```bash
npm run demo:python
node scripts/live-agent-demo.mjs packages/robotscope-viewer/public/demo/demo-python.mcap --port 8766 --loop
```

Connect Live to `ws://127.0.0.1:8766`. This is a recording replay, not a Python
streaming SDK or device-specific integration. Refer to [maturity evidence](maturity.md)
for executed checks and unsupported workloads.
