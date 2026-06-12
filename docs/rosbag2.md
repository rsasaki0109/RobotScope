# Rosbag2 ingest (v0.2 alpha)

Browser-native **rosbag2 SQLite** playback (`*.db3`) — first step toward full rosbag2 support.

## Open in the viewer

1. **Open recording** in the command bar
2. Select a rosbag2 SQLite file (`.db3`, `.sqlite`, `.sqlite3`)
3. RobotScope indexes topics + TF and replays like MCAP

Supported storage layout: standard `topics` + `messages` tables (ROS 2 Humble/Jazzy sqlite3 plugin).

## Limitations (alpha)

| Topic | Status |
|-------|--------|
| SQLite `.db3` in browser | **Supported** (sql.js) |
| CDR decode | Common types via `@foxglove/rosmsg-msgs-common` (same as MCAP) |
| Custom message definitions | Not embedded in sqlite — may fail decode |
| Multi-file bags (`metadata.yaml` + folder) | Open the `.db3` file directly |
| Sidecar cache | MCAP: IndexedDB + companion JSON | **Rosbag2: IndexedDB** (`recording_source: rosbag2`) — skips topic timestamp re-scan |
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

- `openRosbag2()` — `RobotScope/packages/robotscope-core/src/ingest/rosbag2.ts` (lazy-loaded by viewer when opening `.db3`)
- `isRosbag2Filename()` — `RobotScope/packages/robotscope-core/src/ingest/recording-format.ts`
- `Rosbag2QueryEngineImpl` — same query surface as MCAP (`McapQueryEngine` interface)
- Session `source: "rosbag2"`

See [known-limitations.md](RobotScope/docs/known-limitations.md).
