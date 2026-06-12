# RobotScope plugins (v0.1)

Plugin-first layout and panel registration for Autoware, Nav2, MoveIt, and future packs.

## Manifest files

Each plugin ships:

| File | Role |
|------|------|
| `RobotScope/plugins/*/robotscope-plugin.yaml` | Human-readable manifest (schema: `RobotScope/schemas/plugin/v0.1/manifest.json`) |
| `RobotScope/plugins/*/src/manifest.ts` | TypeScript source loaded by the viewer registry |

Keep `contributes.layouts` in sync between YAML and TS.

## Viewer registry

`RobotScope/packages/robotscope-viewer/src/plugins/registry.ts`:

1. Imports plugin manifests + dock components
2. Maps `layout` URL param → plugin right column
3. Exposes layout picker options in the command bar

Adding a plugin:

1. Create `plugins/my-pack/` with `robotscope-plugin.yaml` + `src/manifest.ts`
2. Export dock + snapshot hook from `src/index.ts`
3. Register in `registry.ts` via `registerPlugin(...)`
4. Add Vite/tsconfig alias in `@robotscope/viewer`

## Validation

```bash
node RobotScope/scripts/validate-plugin-manifests.mjs
```

## Layout URLs

| Layout id | Plugin |
|-----------|--------|
| `autoware` | robotscope-autoware |
| `nav2` | robotscope-nav2 |
| `moveit` | robotscope-moveit |
| `example` | robotscope-example |
| `default` | built-in Entity Inspector |

Example: `http://localhost:5173/?layout=nav2`

## Third-party template

Copy `RobotScope/plugins/example/` — see [plugin-sdk-example.md](RobotScope/docs/plugin-sdk-example.md).
