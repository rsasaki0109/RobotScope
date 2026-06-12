# Migration: v0.1 RC → v0.1.0 GA

**Target:** `0.1.0-rc.*` → **`0.1.0`**

## 結論

GA は RC.1 のタグ付けのみ。**API・URL・デモ MCAP ワークフローに意図的な破壊的変更はありません。**

## 確認済み事実

| 項目 | RC.1 | GA (`0.1.0`) |
|------|------|----------------|
| Plugin `api` | `"0.1"` | 同左（凍結継続） |
| Demo URL | `?layout=autoware&demo=1` | 変更なし |
| Live agent | `ws://127.0.0.1:8765` | 変更なし |
| npm workspace バージョン | `0.1.0-rc.1` | `0.1.0` |

## アップグレード手順

```bash
git pull
git checkout v0.1.0   # または main
npm install
npm run typecheck
npm run validate:plugins
```

プラグイン作者: [api-v0.1.md](RobotScope/docs/api-v0.1.md) の frozen surface に準拠していれば追加作業不要。

## 次アクション

- 本番利用: [v0.1.0 release notes](RobotScope/docs/release/v0.1.0.md)
- 新機能要望: v0.2 ロードマップ（Lanelet2 本格、rosbag2-native 等）
