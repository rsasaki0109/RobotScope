# Lanelet2 Boost binary (v1.7 beta)

Native **`LaneletMapBin.data`** parsing for Autoware / `lanelet2_io` Boost archives (beta — heuristic scope unchanged from alpha).

## Scope (beta)

| Feature | Status |
|---------|--------|
| Boost archive detection (`serialization::archive`) | **Supported** |
| Point layer coordinate extraction | **Heuristic** |
| Linestring + lanelet relation scan | **Partial** — simple maps + bounds fallback |
| Regulatory elements / areas / full topology | **Not parsed** |
| Cross-platform / cross-Boost-version bins | **Best effort** — same caveats as Autoware native tools |

## When to use

| Source | Recommendation |
|--------|----------------|
| Autoware `LaneletMapBin` on `/map/vector_map` | Try native parse first — Map panel shows **(Boost bin)** |
| Parse fails or map is complex | Use [lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) OSM sidecar |
| GitHub Pages demo MCAP | Still uses RL2D demo bin — boost tested via fixture script |

## API

- `parseLaneletMapBin()` in `@robotscope/core` — returns `format: "boost-lanelet2"` with boundary polygons
- `isBoostLaneletMapFormat()` — quick format check

## Regenerate test fixture

```bash
bash RobotScope/scripts/generate-lanelet-boost-fixture.sh
node --import tsx RobotScope/scripts/test-lanelet-boost.mjs
```

Requires ROS `lanelet2_core` + `lanelet2_io` development libraries (Jazzy path used in script).

## See also

- [known-limitations.md](RobotScope/docs/known-limitations.md) — alpha boundaries
- [lanelet2-osm.md](RobotScope/docs/lanelet2-osm.md) — OSM sidecar fallback
