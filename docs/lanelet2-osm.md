# Lanelet2 OSM sidecar (v0.6 alpha)

Load an **Autoware / Lanelet2 OSM map** alongside MCAP or rosbag2 playback when native `LaneletMapBin` is not parsed.

## Why sidecar

Autoware `LaneletMapBin.data` uses lanelet2 **Boost binary serialization** — not yet parsed in-browser. Many workflows still have the source **`.osm`** map export with `local_x` / `local_y` node tags.

## Load in the viewer

1. Open a recording (MCAP, `.db3`, or folder bag)
2. **Load map OSM** in the command bar → select `.osm`
3. Map panel shows lanelet/way counts + 2D preview; 3D viewport renders polylines

Use **Clear OSM** to remove the overlay.

## Supported OSM subset

| Feature | Status |
|---------|--------|
| Nodes with `local_x` / `local_y` tags | **Supported** |
| `<way>` polylines via `<nd ref>` | **Supported** |
| `<relation type=lanelet>` with `left` / `right` / `centerline` members | **Supported** (v0.6 alpha) |
| Regulatory elements / traffic rules | Not parsed |
| Native `LaneletMapBin` boost bin | Still **unknown** — use OSM sidecar or RL2D demo MCAP |

When lanelet relations are present, the Map panel draws **closed left/right bounds** and **centerlines** (same palette as RL2D demo). Orphan ways not referenced by a lanelet relation still render as cyan polylines.

## Implementation

- `parseLaneletOsm()` — `RobotScope/packages/robotscope-core/src/ros2/lanelet-osm.ts`
- Viewer overlay state — `laneletOsmOverlay` in viewer store
- Autoware Map panel + 3D scene merge via `laneletOsmToSceneTrajectories()`

See [known-limitations.md](RobotScope/docs/known-limitations.md).
