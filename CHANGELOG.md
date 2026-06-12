# Changelog

All notable changes to RobotScope are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [SemVer](https://semver.org/).

## [0.9.0-beta.0] - 2026-06-13

First v0.9 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates Twist velocity editor on the command gateway. Documentation and known-limitations boundaries updated for local live cmd_vel workflows.

### Added

- [docs/release/v0.9.0-beta.0.md](RobotScope/docs/release/v0.9.0-beta.0.md)
- [docs/migration/v0.9-alpha-to-beta.md](RobotScope/docs/migration/v0.9-alpha-to-beta.md)

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.9 beta boundaries
- [docs/command-gateway.md](RobotScope/docs/command-gateway.md) — beta scope header

## [0.9.0-alpha.0] - 2026-06-13

Twist velocity editor for command gateway.

### Added

- **`twist`** field on `command.publish` — `linear_x` / `angular_z` for `geometry_msgs/msg/Twist`
- Viewer **vx** / **ωz** inputs + **Publish cmd_vel** button
- `buildTwistPublishRequest()` in core command gateway helpers
- [docs/release/v0.9.0-alpha.0.md](RobotScope/docs/release/v0.9.0-alpha.0.md)

### Changed

- [docs/command-gateway.md](RobotScope/docs/command-gateway.md) updated for v0.9 alpha velocity editor
- [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.9 alpha

## [0.8.0] - 2026-06-13

Eighth GA release — permission-gated command gateway.

### Summary

v0.8 GA marks stable delivery of alpha/beta features on top of v0.7. No intentional breaking changes from `0.8.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.8.0.md](RobotScope/docs/release/v0.8.0.md)
- [docs/migration/v0.8-beta-to-ga.md](RobotScope/docs/migration/v0.8-beta-to-ga.md)

### Changed

- README status section updated for **v0.8.0 GA**
- Version series advances from `0.8.0-beta.0` to **`0.8.0`**

## [0.8.0-beta.0] - 2026-06-13

First v0.8 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates permission-gated command gateway. Documentation and known-limitations boundaries updated for local live publish workflows.

### Added

- [docs/release/v0.8.0-beta.0.md](RobotScope/docs/release/v0.8.0-beta.0.md)
- [docs/migration/v0.8-alpha-to-beta.md](RobotScope/docs/migration/v0.8-alpha-to-beta.md)

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.8 beta boundaries
- [docs/command-gateway.md](RobotScope/docs/command-gateway.md) — beta scope header

## [0.8.0-alpha.0] - 2026-06-13

Permission-gated live command gateway (zero cmd_vel).

### Added

- **`command.publish`** live WebSocket messages with **`command.publish_result`** responses
- ROS 2 agent **`--allow-publish TOPIC`** allowlist + lazy publishers
- Demo live agent **`--allow-publish`** + default in `npm run demo:live-agent`
- Viewer **Allow publish** opt-in + **Zero cmd_vel** when agent allowlists `/cmd_vel`
- [docs/command-gateway.md](RobotScope/docs/command-gateway.md)
- [docs/release/v0.8.0-alpha.0.md](RobotScope/docs/release/v0.8.0-alpha.0.md)

### Changed

- [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.8 alpha gateway scope

## [0.7.0] - 2026-06-13

Seventh GA release — OSM regulatory elements.

### Summary

v0.7 GA marks stable delivery of alpha/beta features on top of v0.6. No intentional breaking changes from `0.7.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.7.0.md](RobotScope/docs/release/v0.7.0.md)
- [docs/migration/v0.7-beta-to-ga.md](RobotScope/docs/migration/v0.7-beta-to-ga.md)

### Changed

- README status section updated for **v0.7.0 GA**
- Version series advances from `0.7.0-beta.0` to **`0.7.0`**

## [0.7.0-beta.0] - 2026-06-13

First v0.7 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates OSM regulatory elements overlay. Documentation and known-limitations boundaries updated for daily map workflows with rule-aware OSM exports.

### Added

- [docs/release/v0.7.0-beta.0.md](RobotScope/docs/release/v0.7.0-beta.0.md)
- [docs/migration/v0.7-alpha-to-beta.md](RobotScope/docs/migration/v0.7-alpha-to-beta.md)

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.7 beta boundaries
- [docs/lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) — beta scope header

## [0.7.0-alpha.0] - 2026-06-13

OSM regulatory elements (traffic rules geometry).

### Added

- **`parseLaneletOsm()`** — `<relation type=regulatory_element>` with `subtype` + geometry members
- Map panel regulatory count + subtype breakdown + purple overlay in 2D preview
- 3D trajectories for regulatory `ref_line` / `refers` / `crosswalk_polygon` / `light_bulbs`
- [docs/release/v0.7.0-alpha.0.md](RobotScope/docs/release/v0.7.0-alpha.0.md)

### Changed

- [docs/lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) updated for v0.7 alpha regulatory elements
- [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.7 alpha

## [0.6.0] - 2026-06-13

Sixth GA release — OSM lanelet relations.

### Summary

v0.6 GA marks stable delivery of alpha/beta features on top of v0.5. No intentional breaking changes from `0.6.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.6.0.md](RobotScope/docs/release/v0.6.0.md)
- [docs/migration/v0.6-beta-to-ga.md](RobotScope/docs/migration/v0.6-beta-to-ga.md)

### Changed

- README status section updated for **v0.6.0 GA**
- Version series advances from `0.6.0-beta.0` to **`0.6.0`**

## [0.6.0-beta.0] - 2026-06-12

First v0.6 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates OSM lanelet relations overlay. Documentation and known-limitations boundaries updated for daily map workflows with relation-aware OSM exports.

### Added

- [docs/release/v0.6.0-beta.0.md](RobotScope/docs/release/v0.6.0-beta.0.md)
- [docs/migration/v0.6-alpha-to-beta.md](RobotScope/docs/migration/v0.6-alpha-to-beta.md)

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.6 beta boundaries
- [docs/lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) — beta scope header

## [0.6.0-alpha.0] - 2026-06-12

OSM lanelet relations (left/right/centerline).

### Added

- **`parseLaneletOsm()`** — `<relation type=lanelet>` member resolution
- Map panel lanelet count + RL2D-style OSM lanelet 2D preview
- 3D closed bounds for lanelet left/right + centerline trajectories
- [docs/release/v0.6.0-alpha.0.md](RobotScope/docs/release/v0.6.0-alpha.0.md)

### Changed

- [docs/lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) updated for v0.6 alpha relations
- [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.6 alpha

## [0.5.0] - 2026-06-13

Fifth GA release — Lanelet2 OSM sidecar overlay.

### Summary

v0.5 GA marks stable delivery of alpha/beta features on top of v0.4. No intentional breaking changes from `0.5.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.5.0.md](RobotScope/docs/release/v0.5.0.md)
- [docs/migration/v0.5-beta-to-ga.md](RobotScope/docs/migration/v0.5-beta-to-ga.md)

### Changed

- README status section updated for **v0.5.0 GA**
- Version series advances from `0.5.0-beta.0` to **`0.5.0`**

## [0.5.0-beta.0] - 2026-06-13

First v0.5 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates Lanelet2 OSM sidecar overlay. Documentation and known-limitations boundaries updated for daily map overlay workflows.

### Added

- [docs/release/v0.5.0-beta.0.md](RobotScope/docs/release/v0.5.0-beta.0.md)
- [docs/migration/v0.5-alpha-to-beta.md](RobotScope/docs/migration/v0.5-alpha-to-beta.md)
- README hero GIF (`docs/assets/readme-hero.gif`) + `npm run capture:readme-hero`

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.5 beta boundaries
- [docs/lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) — beta scope header

## [0.5.0-alpha.0] - 2026-06-12

Lanelet2 OSM sidecar overlay (first native map ingest step).

### Added

- **`parseLaneletOsm()`** — Autoware OSM subset (`local_x`/`local_y` nodes + ways)
- Viewer **Load map OSM** / **Clear OSM** commands
- Map panel 2D preview + 3D trajectory merge for OSM sidecar
- [docs/lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md)

### Changed

- [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.5 alpha

## [0.4.0] - 2026-06-12

Fourth GA release — rosbag2 folder bags.

### Summary

v0.4 GA marks stable delivery of alpha/beta features on top of v0.3. No intentional breaking changes from `0.4.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.4.0.md](RobotScope/docs/release/v0.4.0.md)
- [docs/migration/v0.4-beta-to-ga.md](RobotScope/docs/migration/v0.4-beta-to-ga.md)

### Changed

- README status section updated for **v0.4.0 GA**
- Version series advances from `0.4.0-beta.0` to **`0.4.0`**

## [0.4.0-beta.0] - 2026-06-12

First v0.4 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates rosbag2 folder bag ingest. Documentation and known-limitations boundaries updated for daily multi-file bag workflows.

### Added

- [docs/release/v0.4.0-beta.0.md](RobotScope/docs/release/v0.4.0-beta.0.md)
- [docs/migration/v0.4-alpha-to-beta.md](RobotScope/docs/migration/v0.4-alpha-to-beta.md)

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.4 beta boundaries
- [docs/rosbag2.md](RobotScope/docs/rosbag2.md) — beta scope header

## [0.4.0-alpha.0] - 2026-06-12

Rosbag2 folder bag ingest (`metadata.yaml` + multiple `.db3`).

### Added

- **`openRosbag2Folder()`** — parse `metadata.yaml` `relative_file_paths` and merge sqlite storage files
- Viewer **Open bag folder** command (directory picker with `metadata.yaml`)
- Encoded storage ids `(file_index, sqlite_row_id)` for multi-file payload lookup
- Folder bag sidecar cache (fingerprint = metadata + total folder file sizes)

### Changed

- [docs/rosbag2.md](RobotScope/docs/rosbag2.md) + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.4 alpha

## [0.3.0] - 2026-06-12

Third GA release — rosbag2 sidecar cache.

### Summary

v0.3 GA marks stable delivery of alpha/beta features on top of v0.2. No intentional breaking changes from `0.3.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.3.0.md](RobotScope/docs/release/v0.3.0.md)
- [docs/migration/v0.3-beta-to-ga.md](RobotScope/docs/migration/v0.3-beta-to-ga.md)

### Changed

- README status section updated for **v0.3.0 GA**
- Version series advances from `0.3.0-beta.0` to **`0.3.0`**

## [0.3.0-beta.0] - 2026-06-12

First v0.3 beta — scope consolidation after alpha.0.

### Summary

Beta consolidates rosbag2 sidecar cache. Documentation and known-limitations boundaries updated for daily `.db3` re-open workflows.

### Added

- [docs/release/v0.3.0-beta.0.md](RobotScope/docs/release/v0.3.0-beta.0.md)
- [docs/migration/v0.3-alpha-to-beta.md](RobotScope/docs/migration/v0.3-alpha-to-beta.md)

### Changed

- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.3 beta boundaries
- [docs/rosbag2.md](RobotScope/docs/rosbag2.md) — beta scope header

## [0.3.0-alpha.0] - 2026-06-13

Rosbag2 sidecar cache for faster re-open.

### Added

- **Rosbag2 sidecar cache** — IndexedDB + `recording_source: "rosbag2"` tuple format `[time_ns, storage_id]`
- `loadRosbag2Payloads()` + `indexRosbag2TfOnly()` — sidecar fast path skips topic timestamp re-scan

### Changed

- Sidecar manifest supports `recording_source` (`mcap` | `rosbag2`)
- Rosbag2 re-open uses cached sidecar when fingerprint matches
- [docs/rosbag2.md](RobotScope/docs/rosbag2.md) + [known-limitations.md](RobotScope/docs/known-limitations.md) updated

## [0.2.0] - 2026-06-13

Second GA release — cross-layout failure recipes + rosbag2 ingest.

### Summary

v0.2 GA marks stable delivery of alpha/beta features on top of v0.1. No intentional breaking changes from `0.2.0-beta.0`. Plugin API `0.1` unchanged.

### Added

- [docs/release/v0.2.0.md](RobotScope/docs/release/v0.2.0.md)
- [docs/migration/v0.2-beta-to-ga.md](RobotScope/docs/migration/v0.2-beta-to-ga.md)

### Changed

- README status section updated for **v0.2.0 GA**
- Version series advances from `0.2.0-beta.0` to **`0.2.0`**

## [0.2.0-beta.0] - 2026-06-13

First v0.2 beta — scope consolidation after alpha.1.

### Summary

Beta consolidates cross-layout recipe banner + rosbag2 ingest. Demo MCAP bundle no longer includes sql.js (lazy load on `.db3` open).

### Added

- [docs/release/v0.2.0-beta.0.md](RobotScope/docs/release/v0.2.0-beta.0.md)
- [docs/migration/v0.2-alpha-to-beta.md](RobotScope/docs/migration/v0.2-alpha-to-beta.md)

### Changed

- **Lazy rosbag2 import** — `openRosbag2` dynamic import; sql.js excluded from default viewer bundle
- `isRosbag2Filename()` moved to `recording-format.ts` (no sql.js dependency)
- README + [known-limitations.md](RobotScope/docs/known-limitations.md) updated for v0.2 beta boundaries

## [0.2.0-alpha.1] - 2026-06-13

Rosbag2 SQLite browser ingest (first native step).

### Added

- **`openRosbag2()`** — browser playback of rosbag2 `.db3` via sql.js + `Rosbag2QueryEngineImpl`
- Viewer **Open recording** accepts `.db3` / `.sqlite3`
- [docs/rosbag2.md](RobotScope/docs/rosbag2.md) + `npm run convert:rosbag2` fallback script

### Changed

- [known-limitations.md](RobotScope/docs/known-limitations.md) — documents alpha rosbag2 support vs remaining gaps

## [0.2.0-alpha.0] - 2026-06-13

First v0.2 alpha — cross-layout failure recipe banner.

### Added

- **Cross-layout recipe banner** in main shell — all-stack failure recipes at playhead; click chip to switch `?layout=`
- Works for MCAP playback and live streaming (same evaluation as timeline strip)

## [0.1.0] - 2026-06-13

First v0.1 general availability — stable plugin API, no breaking changes from rc.1.

### Summary

GA marks the completion of the v0.1 line: alpha → beta → RC → **0.1.0**. Daily Autoware/Nav2/MoveIt MCAP + live debug workflows, plugin SDK example, unified failure recipe timeline, GitHub Pages deploy.

### Added

- [docs/release/v0.1.0.md](RobotScope/docs/release/v0.1.0.md) — GA milestone notes
- [docs/migration/rc-to-ga.md](RobotScope/docs/migration/rc-to-ga.md) — RC → GA checklist

### Changed

- README status section updated for **v0.1.0 GA**
- Version series advances from `0.1.0-rc.1` to **`0.1.0`**

## [0.1.0-rc.1] - 2026-06-13

Autoware Map panel Lanelet2 2D preview.

### Added

- **Lanelet2 2D canvas preview** in Autoware Map panel — RL2D boundary loops + centerline polylines + ego dot
- `extractLaneletCenterlinesView()` — `/map/lanelet2_centerlines` Path → panel overlay
- `map_lanelet_centerlines` topic slot in autoware profile

### Changed

- [known-limitations.md](RobotScope/docs/known-limitations.md) — documents 2D panel preview

## [0.1.0-rc.0] - 2026-06-13

First v0.1 release candidate — API freeze for integrators.

### Added

- [docs/api-v0.1.md](RobotScope/docs/api-v0.1.md) — frozen plugin manifest, query API, URL params, live protocol
- [docs/migration/beta-to-rc.md](RobotScope/docs/migration/beta-to-rc.md) — beta → RC checklist for plugin authors

### Changed

- README status section updated for RC (`0.1.0-rc.0`)
- Version series advances from `0.1.0-beta.*` to `0.1.0-rc.0` (no intentional breaking API changes)

## [0.1.0-beta.2] - 2026-06-13

Plugin SDK minimal third-party example pack.

### Added

- **`plugins/example/`** — copyable template: manifest, profile, snapshot builder, dock, session panel
- Layout **`example`** / **`example-starter`** registered in viewer + command bar
- [docs/plugin-sdk-example.md](RobotScope/docs/plugin-sdk-example.md) — register, validate, snapshot hook pattern
- `npm run demo:example` — opens `?layout=example&demo=1`

### Changed

- [docs/plugins.md](RobotScope/docs/plugins.md) links to SDK example

## [0.1.0-beta.1] - 2026-06-13

Lanelet2 RL2D demo format parser and 3D boundary rendering.

### Added

- **`parseLaneletMapBin()`** — RobotScope demo RL2D v1 lanelet boundaries in `LaneletMapBin.data`
- **3D closed boundary loops** for parsed lanelets (distinct from centerline polylines)
- **Map panel** lanelet / boundary point counts when RL2D payload parses
- Demo MCAP `/map/vector_map` encodes 2 RL2D lanelet polygons

### Changed

- [known-limitations.md](RobotScope/docs/known-limitations.md) — documents RL2D demo vs native Autoware bin

## [0.1.0-beta.0] - 2026-06-13

First v0.1 beta — documentation and scope consolidation after alpha.8.

### Summary

Beta marks a stable **daily-debug demo** surface: MCAP + live agent + Autoware/Nav2/MoveIt plugins + unified failure recipe timeline (including live evaluation) + GitHub Pages deploy.

### Added

- [docs/known-limitations.md](RobotScope/docs/known-limitations.md) — beta scope boundaries
- [docs/release/v0.1.0-beta.0.md](RobotScope/docs/release/v0.1.0-beta.0.md) — beta milestone notes

### Changed

- README updated for beta status, doc links, and consolidated feature table
- Version series advances from `0.1.0-alpha.*` to `0.1.0-beta.0` (no breaking API guarantee until v1.0)

## [0.1.0-alpha.8] - 2026-06-13

Live failure recipe evaluation on the unified timeline.

### Added

- **Live failure recipe evaluation** — timeline strip updates during WebSocket streaming
- `evaluateFailureRecipesAtTime()` and live marker accumulation on the scrub bar
- Green **live** badge on failure recipe strip

### Changed

- Failure recipe strip visible during live sessions (was MCAP-only)
- [docs/live-agent.md](RobotScope/docs/live-agent.md) documents live recipe behavior

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
