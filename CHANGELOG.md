# Changelog

All notable changes to RobotScope are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [SemVer](https://semver.org/).

## [0.1.0-alpha.7] - 2026-06-13

Live agent connection UX and failure recipe timeline legend.

### Added

- **Failure recipe timeline legend** (stack colors + “click ticks to seek”)
- **Live agent URL preset** in command bar (`Local demo :8765`)
- **`?live=1` / `?liveUrl=`** query params for auto-connect
- [docs/live-agent.md](RobotScope/docs/live-agent.md) — demo agent, ROS2 agent, Pages note

### Changed

- `demo:live-agent` prefers `packages/robotscope-viewer/public/demo/demo-scene.mcap` when present

## [0.1.0-alpha.6] - 2026-06-13

Unified failure recipe timeline across Autoware, Nav2, and MoveIt.

### Added

- **Failure recipe timeline strip** — active recipes at playhead for all plugin stacks
- **Seekable recipe markers** on the timeline (stack-colored ticks)
- Background recipe index on MCAP load (`indexFailureRecipeMarkers`)

## [0.1.0-alpha.5] - 2026-06-13

Nav2 and MoveIt failure recipe UI on the shared demo MCAP.

### Added

- **Nav2 failure recipe UI** — controller stuck + localization uncertainty; panel highlight banner
- **MoveIt failure recipe UI** — joint overspeed + scene collision; panel highlight banner
- Demo MCAP: Nav2 stuck window (~0.5s), MoveIt overspeed (~0.7s), end-of-clip localization/collision scenarios
- Demo topic `/monitored_planning_scene` (MoveIt collision stub)

### Changed

- `extractPlanningSceneView()` accepts demo stub `collision_objects` / `robot_joint_count` fields
- README demo table covers Autoware, Nav2, and MoveIt scrub times on GitHub Pages

## [0.1.0-alpha.4] - 2026-06-12

GitHub Pages demo deploy and control tracking failure recipe.

### Added

- **GitHub Pages workflow** — builds static viewer + demo MCAP on push to `main`
- **`?demo=1` auto-load** — fetches bundled `demo-scene.mcap` from viewer `public/demo/`
- **Control tracking failure recipe** — lateral/longitudinal error + low cmd_vel; highlights Control + Planning panels
- **`/cmd_vel` in Autoware profile** — cmd velocity surfaced in Control Error panel
- Demo MCAP control-tracking window at frames 8–12 (~0.8–1.2s)

### Changed

- Vite `pages` mode uses `/RobotScope/` base path for GitHub Pages
- README links to live Autoware demo URL

## [0.1.0-alpha.3] - 2026-06-12

Autoware perception observability and phantom obstacle failure recipe demo.

### Added

- **Autoware Perception Objects panel** — object count, max confidence, low-confidence count, brief-spike flag
- **`extractPerceptionView()`** with 150ms lookback for brief detection spikes
- **Phantom obstacle stop failure recipe** — requires stalled planning + brief perception object; highlights Planning and Perception panels
- Demo MCAP: `/perception/object_recognition/objects` with phantom object from frame 14; planning trajectory stalls in sync
- Agent autoware profile subscribes to perception objects topic

### Changed

- Demo script fixes LaneletMapBin schema registration (was incorrectly aliased to PredictedObjects)

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
