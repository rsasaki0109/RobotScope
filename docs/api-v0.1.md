# RobotScope API v0.1 (RC freeze)

**Status:** frozen at **`0.1.0-rc.0`** for plugin authors and integrators.

v0.1 targets daily Autoware / Nav2 / MoveIt debug workflows. Breaking changes to the surfaces below require a new **`api`** version (e.g. `"0.2"`) — not a silent patch.

## Frozen surfaces

### Plugin manifest (`api: "0.1"`)

Schema: `RobotScope/schemas/plugin/v0.1/manifest.json`

| Field | Contract |
|-------|----------|
| `name` | Must start with `robotscope-` |
| `api` | Must be `"0.1"` (`PLUGIN_API_VERSION` in `@robotscope/core`) |
| `contributes.layouts` | Layout ids for `?layout=` URL param |
| `capabilities` | Declared read-only capabilities (no runtime enforcement yet) |
| `permissions` | All bundled plugins: publish/service/network **false** |

Validate YAML ↔ TS sync:

```bash
npm run validate:plugins
```

### Plugin registration (viewer)

Stable hook contract in `RobotScope/packages/robotscope-viewer/src/plugins/types.ts`:

```typescript
type PluginSnapshotHook<T> = (slice: {
  ingest: IngestHandle | null;
  session: SessionInfo | null;
  currentTimeNs: number;
}) => { snapshot: T | null; loading: boolean };
```

Register via `registerPlugin(manifest, layoutIds, useSnapshot, Dock)` in `registry.ts`.

Reference implementation: `RobotScope/plugins/example/`.

### `@robotscope/core` query API

Stable for MCAP + live ingest:

| Type / function | Role |
|-----------------|------|
| `SessionInfo` | `source`, time bounds, `topics[]` |
| `McapQueryEngine` | `getRawMessageNearTime`, `getTfTree`, `getMappedTopics`, … |
| `openMcap()` / `openLive()` | Ingest entrypoints |
| `buildSceneSnapshot()` | 3D scene from mapped topics |
| `parseLaneletMapBin()` | RL2D demo + unknown native bin |
| `PluginManifest`, `layoutIdsFromManifest()` | Plugin metadata |

Import path in monorepo: `@robotscope/core` (workspace package).

### Viewer URL parameters

| Param | Example | Behavior |
|-------|---------|----------|
| `layout` | `?layout=autoware` | Plugin right column |
| `demo` | `?demo=1` | Auto-load bundled demo MCAP |
| `live` | `?live=1` | Auto-connect live agent |
| `liveUrl` | `?liveUrl=ws://127.0.0.1:8765` | Override WebSocket URL |

`demo=1` takes priority over `live=1` when both are set.

### Live agent protocol

Version string: **`robotscope.live.v0.1`** (see `scripts/live-agent-demo.mjs`).

Default WebSocket: `ws://127.0.0.1:8765`.

### Sidecar index

Convention: `{mcap_path}.robotscope/index.json` — see `docs/architecture.md`.

## Not frozen (may change before v1.0)

- Internal React component props (non-plugin docks)
- Failure recipe heuristics and panel highlight styling
- Demo MCAP topic timing (demo-only)
- GitHub Pages base path (`/RobotScope/`)
- Bundled plugin panel layouts (Autoware / Nav2 / MoveIt UI)

New features may be added in **minor** v0.1.x releases without breaking the contracts above.

## Versioning map

| Tag series | Meaning |
|------------|---------|
| `0.1.0-alpha.*` | Feature exploration |
| `0.1.0-beta.*` | Demo-ready; docs + SDK |
| **`0.1.0-rc.*`** | **API freeze for integrators** |
| `0.1.0` (planned) | v0.1 GA after RC soak |

## Related docs

- [Migration: beta → RC](RobotScope/docs/migration/beta-to-rc.md)
- [Plugin SDK example](RobotScope/docs/plugin-sdk-example.md)
- [Known limitations](RobotScope/docs/known-limitations.md)
