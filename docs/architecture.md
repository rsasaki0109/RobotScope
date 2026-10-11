# RobotScope Architecture (Draft v0.1)

Master design document for the RobotScope OSS observability platform.

> **Full narrative:** This file summarizes the architecture. The complete draft with competitive analysis, roadmaps, and failure recipes lives in the same directory as the source-of-truth design review.

## Executive summary

**RobotScope is an open observability platform for embodied intelligence.** It explains what the robot sensed, believed, planned, commanded, learned, and remembered — on one timeline, one coordinate frame, and one causality graph.

**Do not compete head-on with:**

| Competitor | Avoid |
|------------|-------|
| Foxglove | Viewer polish / generic MCAP panels |
| Rerun | Generic multimodal data layer |
| RViz | Display-only web clone |

**Win on:** robot decision debugging + Physical-AI semantics + fully OSS + plugin-first. ROS 2 and Autoware are supported integrations, alongside direct Python/JSON telemetry.

## Design principles

1. Offline-first  
2. Middleware-independent core; ROS 2 through an input adapter
3. MCAP-compatible (no proprietary log format in v0.1)  
4. Entity/Component-based (RDM)  
5. Coordinate frames / time / causality-aware (including ROS TF)
6. Domain workflows through plugins, with Autoware as an initial wedge
7. Physical-AI-native  
8. Plugin-first  
9. Renderer-agnostic (Three.js v0.1 → wgpu v1.0)  
10. Cloud-optional  

## Layered architecture

```
UI Shell (layouts, timeline, panels, command bar)
        ↓
Visualization Plane (3D, plots, graphs, episode views)
        ↓
Query API (time, spatial, entity, graph, causal, dataset)
        ↓
RobotScope Data Model (Entity, Component, Archetype, Timeline, Frame, Causality)
        ↓
Robotics Plane │ AI Plane │ Storage Plane
        ↓
Data Plane (Python SDK → JSON MCAP, ROS2 agent, MCAP/rosbag2, adapters)
        ↓
Plugin Plane │ Deployment Plane
```

## RobotScope Data Model (RDM)

Semantic **entity paths** (not raw topic names):

```
/world/map/lanelet2
/robot/ego/localization/pose
/policy/main/vla_state
```

Input stream names, schemas and ROS topics live in **provenance**:

```yaml
source.topic: /localization/kinematic_state
source.node: /ekf_localizer
source.schema: nav_msgs/msg/Odometry
```

**Timelines:** `log_time`, `sensor_time`, `valid_time`, `sim_time`, `model_step`, `episode_step`.

**Storage:** MCAP is the primary interchange format; rosbag2 is also supported. JSON MCAP carries ordinary UTF-8 JSON with embedded JSON schemas and explicit semantic channel metadata. RRD and DuckDB/Arrow are future directions, not implemented readers. Sidecar v0.1 = per-topic time index at `{file.mcap}.robotscope/index.json` (+ IndexedDB in browser).

**Current non-ROS path:** the Python SDK records scalar/structured telemetry,
poses, images, points, trajectories and transforms. The ingest layer dispatches
on channel message encoding (`json` or ROS 2 `cdr`), maps explicit entity paths,
and exposes the same query and visualization API to both. JSON channels can also
arrive over the live WebSocket protocol and retain their encoding/metadata when
recorded. Unknown codecs are reported as decode errors. See
[the input contract](non-ros-input.md); naming ROS-like topics is not required.

RDM schemas: `RobotScope/schemas/rdm/v0.1/`

## v0.1 MVP (10.1)

| Package | Role |
|---------|------|
| `packages/robotscope-core` | RDM, MCAP ingest, query API |
| `packages/robotscope-viewer` | React + Three.js shell |
| `plugins/autoware` | Localization, NDT, planning panels |
| `agent/` | ROS2 live bridge (WebSocket) |

**In:** MCAP playback, TF, URDF, PointCloud2, Image, Pose, Trajectory, OccupancyGrid, Autoware layout, Observation/Action/VLAState seed.

**Out:** Cloud, full 3DGS/NeRF, marketplace, proprietary formats.

## 3-month roadmap (summary)

| Month | Focus |
|-------|-------|
| 1 | Skeleton, MCAP reader, 3D shell, timeline |
| 2 | ROS2 agent, Autoware topic profile, URDF/costmap |
| 3 | NDT panel, Lanelet2, plugin manifest, alpha release |

## Killer demos

1. **Autoware localization failure** — NDT score, covariance, TF health, planning stop on one screen.  
2. **VLA manipulation failure** — instruction, image, action, reward, execution error on episode timeline.

## References

- RDM schemas: `schemas/rdm/v0.1/`
- Plugin manifest: `schemas/plugin/v0.1/manifest.json`
- Autoware topic profile: `plugins/autoware/profiles/autoware.universe.yaml`
