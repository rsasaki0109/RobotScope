# Changelog

All notable changes to RobotScope are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [SemVer](https://semver.org/).

## [0.1.0-alpha.2] - 2026-06-13

Autoware debug UX: 3D map layers and failure recipe panel highlighting.

### Added

- **3D occupancy map rendering** — `/map/map` and mapped OccupancyGrid topics as textured meshes in the viewport
- **Lanelet2 centerlines in 3D** — Path topics (e.g. `/map/lanelet2_centerlines`) rendered as amber polylines
- **`parseOccupancyGrid()`** in `@robotscope/core`
- **Autoware failure recipe UI** — detects localization drift / phantom stop patterns and highlights relevant panels
- Demo MCAP lanelet centerlines topic; agent autoware profile extended

### Changed

- README clone URL → `rsasaki0109/RobotScope`
- Fixed `failure_recipes` indentation in `autoware.universe.yaml`

## [0.1.0-alpha.1] - 2026-06-13

Post-alpha polish: Autoware map observability and demo data.

### Added

- **Autoware Map / Lanelet2 panel** — vector map payload stats, occupancy grid preview, ego pose overlay
- Demo MCAP topics: `/map/vector_map` (LaneletMapBin) and `/map/map` (OccupancyGrid)
- Autoware agent profile subscribes to map topics
- Entity mapper rules for `/map/map` and Lanelet2 binary schemas

### Changed

- Autoware localization failure recipe includes `autoware.map` panel

## [0.1.0-alpha.0] - 2026-06-12

First public alpha of the RobotScope OSS observability platform for ROS2, Autoware, Nav2, MoveIt, and Physical AI seed types.

### Added

#### Core (`@robotscope/core`)

- MCAP ingest and query engine with TF indexing (`/tf`, `/tf_static`)
- Topic time index and sidecar manifest (`SidecarManifest`, IndexedDB cache in viewer)
- Semantic entity mapping (ROS topic rules → RDM entity paths)
- ROS2 CDR decode for raw message inspection
- 3D scene builder: TF, URDF, PointCloud2, Image, Pose, Trajectory, OccupancyGrid
- Physical AI seed archetypes: Observation, Action, VLAState
- Live ingest over WebSocket (`openLive`, `LiveIngestBuffer`, `LiveQueryEngine`)
- Live → MCAP recording (`LiveMcapRecorder`) with sidecar index built during capture
- Plugin manifest schema loader (`robotscope-plugin.yaml`)

#### Viewer (`@robotscope/viewer`)

- React + Three.js workspace: timeline, 3D viewport, TF tree, entity inspector
- Drag-and-drop MCAP open; sidecar-accelerated reload when index is cached
- **Connect Live** (WebSocket agent) with follow timeline
- **Record Live** / **Stop & Save MCAP** (download + reload for offline scrubbing)
- Layout picker and URL param `?layout=` for plugin packs
- Plugin registry with dynamic right-column panels

#### Plugins

- **Autoware** — localization, NDT score, planning, control error panels (`?layout=autoware`)
- **Nav2** — AMCL, costmap, plan, goal, controller panels (`?layout=nav2`)
- **MoveIt** — joint state, planning scene, trajectory panels (`?layout=moveit`)

#### Agent & demos

- Python ROS2 live bridge (`agent/robotscope_agent/`) with profiles: `default`, `autoware`, `nav2`, `moveit`
- Demo MCAP generator (`scripts/create-tf-demo.mjs`)
- Node live replay agent (`scripts/live-agent-demo.mjs`)
- CLI sidecar writer (`scripts/write-sidecar.mjs`)
- Plugin manifest validator (`npm run validate:plugins`)

#### Docs & schemas

- Architecture draft (`docs/architecture.md`)
- Plugin guide (`docs/plugins.md`)
- RDM schemas under `schemas/rdm/v0.1/`
- Plugin manifest JSON Schema under `schemas/plugin/v0.1/`

### Known limitations (alpha)

- Read-only observability; no publish/service/action gateway in v0.1
- ROS2 agent requires active publishers (warns when no topics subscribed)
- Sidecar cache is browser IndexedDB; CLI writes `{file.mcap}.robotscope/index.json`
- No rosbag2 SQLite reader (convert to MCAP first)
- Cloud, fleet dashboard, and advanced renderers (3DGS/NeRF) are out of scope

### Security

- Live agent and viewer are read-only in v0.1
- Do not commit robot identifiers, keys, or raw dumps to the repo

[0.1.0-alpha.2]: https://github.com/rsasaki0109/RobotScope/releases/tag/v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/rsasaki0109/RobotScope/releases/tag/v0.1.0-alpha.1
[0.1.0-alpha.0]: https://github.com/rsasaki0109/RobotScope/releases/tag/v0.1.0-alpha.0
