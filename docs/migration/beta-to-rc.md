# Migration: v0.1 beta → v0.1 RC

**Target:** `0.1.0-beta.*` → **`0.1.0-rc.0`**

No intentional breaking changes for plugin authors or MCAP workflows. RC adds an **API freeze declaration**, not a rewrite.

## 結論

- 既存の **Autoware / Nav2 / MoveIt** レイアウトとデモ URL はそのまま使える
- 第三者プラグインは **`plugins/example/`** をベースに **`api: "0.1"`** を維持すれば RC 互換
- 破壊的変更が必要な場合は将来 **`api: "0.2"`** で別スキーマを用意する（v0.1 では未実施）

## 確認済み事実

| 項目 | beta.2 | RC |
|------|--------|-----|
| Plugin manifest `api` | `"0.1"` | `"0.1"`（凍結） |
| `?layout=` ids | autoware, nav2, moveit, example, … | 変更なし |
| Demo URL | `?layout=autoware&demo=1` | 変更なし |
| Live agent port | `8765` | 変更なし |
| `@robotscope/core` exports | query + scene + plugin | 凍結対象を [api-v0.1.md](RobotScope/docs/api-v0.1.md) に文書化 |

## Plugin 作者向けチェックリスト

1. **Manifest 同期** — `robotscope-plugin.yaml` と `src/manifest.ts` の `contributes.layouts` が一致
2. **Validate** — `npm run validate:plugins`
3. **Snapshot hook** — `isMcapQueryEngine(engine)` ガード + `build*Snapshot(engine, session, time_ns)` パターン
4. **Registry** — viewer の `registry.ts` + Vite alias に登録（fork 利用時）
5. **Permissions** — v0.1 は read-only; `command.publish: false` 推奨

## npm ワークスペース利用者

```bash
git pull
npm install
npm run typecheck
npm run validate:plugins
```

バージョン文字列は `0.1.0-rc.0` に更新。パッケージ名 `@robotscope/core`, `@robotscope/viewer`, `@robotscope/plugin-*` は変更なし。

## 未確認 / 要確認項目

- 外部リポジトリから `@robotscope/core` を npm publish 前提で使っている場合 — 現状 monorepo workspace 前提（npm 未 publish）
- カスタム live agent — `robotscope.live.v0.1` プロトコル準拠を確認

## 次アクション

- RC 期間中: バグ修正 + ドキュメントのみ（API 破壊なし）
- v0.1.0 GA: RC soak 後にタグ
- v1.0 方向: Lanelet2 本格パース、rosbag2-native、command gateway は **v0.2+ 候補**

See [api-v0.1.md](RobotScope/docs/api-v0.1.md) for the full frozen surface list.
