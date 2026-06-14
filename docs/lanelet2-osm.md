# Lanelet2 OSM sidecar (v0.7)

Load an **Autoware / Lanelet2 OSM map** alongside MCAP or rosbag2 playback when native `LaneletMapBin` is not parsed.

## Why sidecar

Autoware `LaneletMapBin.data` uses lanelet2 **Boost binary serialization** — not yet parsed in-browser. Many workflows still have the source **`.osm`** map export with `local_x` / `local_y` node tags.

## Load in the viewer

1. Open a recording (MCAP, `.db3`, or folder bag)
2. **Load map OSM** in the command bar → select `.osm`
3. Map panel shows lanelet/regulatory counts + 2D preview; 3D viewport renders polylines

Use **Clear OSM** to remove the overlay.

## Supported OSM subset

| Feature | Status |
|---------|--------|
| Nodes with `local_x` / `local_y` tags | **Supported** |
| `<way>` polylines via `<nd ref>` | **Supported** |
| `<relation type=lanelet>` with `left` / `right` / `centerline` members | **Supported** (v0.6+) |
| `<relation type=regulatory_element>` with `subtype` + geometry members | **Supported** (v0.7) |
| Regulatory `yield` lanelet refs (relation members) | Counted only — no geometry overlay |
| Native `LaneletMapBin` boost bin | **Alpha heuristic** — see [lanelet2-boost-bin.md](RobotScope/docs/lanelet2-boost-bin.md); OSM sidecar for full topology |

Regulatory geometry roles parsed for preview: `refers`, `ref_line`, `crosswalk_polygon`, `light_bulbs`. Common subtypes include `traffic_light`, `speed_limit`, `crosswalk`, `detection_area`.

## Implementation

- `parseLaneletOsm()` — `RobotScope/packages/robotscope-core/src/ros2/lanelet-osm.ts`
- Viewer overlay state — `laneletOsmOverlay` in viewer store
- Autoware Map panel + 3D scene merge via `laneletOsmToSceneTrajectories()`

See [known-limitations.md](RobotScope/docs/known-limitations.md).
