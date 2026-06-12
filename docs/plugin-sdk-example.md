# Plugin SDK example (v0.1)

Minimal third-party plugin you can copy to build a custom layout and right-column dock.

## Try the bundled example

```bash
npm install
npm run build:pages          # optional — loads demo MCAP with ?demo=1
npm run demo:example         # opens ?layout=example&demo=1
```

Or online: https://rsasaki0109.github.io/RobotScope/?layout=example&demo=1

The **Example Plugin** layout shows a session panel (topic count, playhead, `/tf` presence) plus the built-in Entity Inspector tab.

## Copy `plugins/example/`

| File | Purpose |
|------|---------|
| `robotscope-plugin.yaml` | Human-readable manifest (validated against TS) |
| `src/manifest.ts` | `EXAMPLE_PLUGIN_MANIFEST` — loaded by viewer registry |
| `src/profile.ts` | Topic name hints (`/tf`, `/odom`) |
| `src/build-snapshot.ts` | `buildExampleSnapshot(engine, session, time_ns)` |
| `src/hooks/useExampleSnapshot.ts` | React hook wired to viewer store |
| `src/ExampleDock.tsx` | Right-column UI (tabs + panels) |
| `src/index.ts` | Public exports |

## Register in the viewer

1. Add workspace dependency in `packages/robotscope-viewer/package.json`:

   ```json
   "@robotscope/plugin-my-pack": "*"
   ```

2. Add Vite aliases in `packages/robotscope-viewer/vite.config.ts` (same pattern as `@robotscope/plugin-example`).

3. Register in `packages/robotscope-viewer/src/plugins/registry.ts`:

   ```typescript
   registerPlugin(
     MY_PLUGIN_MANIFEST,
     layoutIdsFromManifest(MY_PLUGIN_MANIFEST),
     useMySnapshot,
     MyDock,
   );
   ```

4. Add a layout label in `LAYOUT_LABELS` (optional, for command bar picker).

## Manifest contract

- `name` must start with `robotscope-`
- `api` must be `"0.1"` (`PLUGIN_API_VERSION` in `@robotscope/core`)
- `contributes.layouts` must match between YAML and `manifest.ts`

Validate:

```bash
npm run validate:plugins
```

Schema: `RobotScope/schemas/plugin/v0.1/manifest.json`

**API stability:** `api: "0.1"` is frozen at RC — see [api-v0.1.md](RobotScope/docs/api-v0.1.md).

## Snapshot hook pattern

Plugins receive viewer slice `{ ingest, session, currentTimeNs }` and return `{ snapshot, loading }`:

1. Guard with `isMcapQueryEngine(engine)` — live and MCAP both use the same query surface in v0.1.
2. Call `build*Snapshot(engine, session, time_ns)` on playhead changes.
3. Render panels from `snapshot` in your dock component.

See Nav2 / MoveIt / Autoware plugins for failure recipes and richer extractors.

## Permissions (v0.1)

All bundled plugins set:

```yaml
permissions:
  command.publish: false
  command.service_call: false
  network: false
```

RobotScope v0.1 is **read-only observability** — no command gateway yet.

## Next steps

- Add panels under `src/panels/`
- Map topics in `profile.ts` against `session.topics`
- Optional: export `build*Snapshot` for failure recipe indexing (see `@robotscope/plugin-nav2`)

See also: [docs/plugins.md](RobotScope/docs/plugins.md)
