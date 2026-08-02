# 03 データモデル設計

外部設計書。**PO が承認すべき設計事項**のうち、永続化されるデータの構造とその制約に関するものを扱う。

- 「何ができるか」（機能要件）は [REQUIREMENTS.md](../../REQUIREMENTS.md) を参照する
- 「どう作られているか」（実装パターン・コード上の規約）は [docs/internal-design/](../internal-design/) を参照する
- 本書の変更は 200_設計 工程で行い、PO 承認を得る（[WORKFLOW.md](../../WORKFLOW.md) を参照）

> **本ファイルは現時点では器のみである。** 内部設計書からの該当節の移設は次回作業で行う。器と中身を分けているのは、移設そのものを独立した差分として検証できるようにするため。

## 移設予定の節（次回作業の対象）

以下は移設候補として洗い出したものであり、**実際に移設するかどうかは移設作業時に節単位で再判断する**。

### `docs/internal-design/favorites-data-model.md` から

- `#favorite-node-structure` — `FavoriteNode` の隣接リスト方式（`parentId` を持つフラット配列）というデータ構造の選択
- `#reserved-folders` — 予約フォルダ（ピン止め／お気に入り／メモ）の固定 ID と、Rust 側での二重バリデーション方針
- `#favorites-tree` — ピン止め（実質1階層）とお気に入り（実際に木を組む）の構造上の違い
- `#favorite-edit-virtual-root-row` — お気に入り編集ビューの仮想固定行と、既存ルートセンチネルの流用方針
- `#duplicate-folder-name-validation` — 同一階層内の同名フォルダを禁止するバリデーション
- `#favorite-mode-ordering` — `/favorite` の並び順を機械的に再整列しない方針

### `docs/internal-design/settings-panel-architecture.md` から

- `#settings-persistence-schema` — `settings.json` の永続化スキーマ

### `docs/internal-design/file-search-and-frecency.md` から

- `#frecency` — frecency スコアの計算式（REQUIREMENTS.md と記述が重複しているため、移設時に正本を1箇所へ寄せる必要がある）
- `#folder-detail-settings` — ブラックリスト用・ホワイトリスト用を独立フィールドとして持つデータ構造判断
