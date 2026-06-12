# Rosbag2 ingest (v0.4 alpha)

Browser-native **rosbag2 SQLite** playback — single `.db3` or **folder bags** (`metadata.yaml` + multiple storage files) with **IndexedDB sidecar** on re-open.

## Open in the viewer

### Single sqlite file

1. **Open recording** in the command bar
2. Select a rosbag2 SQLite file (`.db3`, `.sqlite`, `.sqlite3`)

### Folder bag (multi-file)

1. **Open bag folder** in the command bar
2. Select the rosbag2 bag directory (must contain `metadata.yaml` and listed `.db3` files)
3. RobotScope reads `relative_file_paths` from metadata and merges storage in order

Supported storage layout: standard `topics` + `messages` tables (ROS 2 Humble/Jazzy sqlite3 plugin).

## Limitations (v0.4 alpha)

| Topic | Status |
|-------|--------|
| SQLite `.db3` in browser | **Supported** (sql.js) |
| Folder bag (`metadata.yaml` + `.db3` list) | **Supported** (Open bag folder) |
| CDR decode | Common types via `@foxglove/rosmsg-msgs-common` (same as MCAP) |
| Custom message definitions | Not embedded in sqlite — may fail decode |
| mcap / zstd rosbag2 storage plugins | Not supported in browser — convert to MCAP |
| Sidecar cache | MCAP: IndexedDB + companion JSON · **Rosbag2: IndexedDB** — skips topic timestamp re-scan |
| Failure recipes on rosbag2 | Works when topics match plugin profiles |

## Fallback: convert to MCAP

When decode fails or you need maximum compatibility:

```bash
bash RobotScope/scripts/rosbag2-to-mcap.sh input.db3 output.mcap
```

Or:

```bash
ros2 bag convert -i input.db3 -o output.mcap
```

Then open `output.mcap` in RobotScope.

## Implementation

- `openRosbag2()` — single sqlite file
- `openRosbag2Folder()` — `RobotScope/packages/robotscope-core/src/ingest/rosbag2.ts`
- `parseRosbag2MetadataYaml()` — `RobotScope/packages/robotscope-core/src/ingest/rosbag2-metadata.ts`
- `isRosbag2Filename()` / `isRosbag2MetadataFilename()` — `recording-format.ts`
- `Rosbag2QueryEngineImpl` — same query surface as MCAP (`McapQueryEngine` interface)
- Session `source: "rosbag2"`

See [known-limitations.md](RobotScope/docs/known-limitations.md).
