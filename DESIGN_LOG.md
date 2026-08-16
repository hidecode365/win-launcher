# DESIGN_LOG

200_設計 工程での設計協議の一時記録。運用ルールは `WORKFLOW.md` の 200_設計・500_リリース前作業 の節、および [docs/process/ad_app_200_design.md](docs/process/ad_app_200_design.md)・[docs/process/ad_app_500_pre-release.md](docs/process/ad_app_500_pre-release.md) を参照。

- トピックごとに `##` 見出しで区切って追記する（1トピック1見出し。複数トピックを1つの見出しにまとめない）
- 500_リリース前作業 で `CLAUDE.md`/`docs/internal-design/*.md` への正式反映が確認できたトピックの見出しのみを削除する（部分クリア。他の未反映トピックを巻き込んで削除しない）
- 反映済みかどうか判断がつかない見出しを見つけた場合、存在するというだけで自動的に削除せず、`CLAUDE.md`・対応する `docs/internal-design/*.md` の実際の記載と突き合わせてから判定する

## 段階5「/memo」MemoDocumentの保存経路と版管理

PO承認済み。`MemoDocument` は以下の形とする。

```ts
type MemoDocument = {
  revision: number;
  content: string;
  savedAt: string;
  draft: { content: string; updatedAt: string } | null;
};
```

- 本文の読み書きは、確定版・下書き・確定保存時のdraft消去を含めてRustコマンドへ一本化する。フロントエンドから同じ保存オブジェクトを直接更新する経路は設けない
- 1メモ単位の保存コマンドで更新を直列化し、確定保存時は「旧確定版の履歴化（将来追加時）→新確定版の更新→draft消去」を一貫して扱えるようにする
- `revision` は確定版の世代番号。スキーマ移行用の`schemaVersion`は新設しない。既存の「追加フィールドへdefaultを付与して旧データを読む」後方互換方針に従う
- 将来の確定版履歴は`versionHistory`（各要素は`revision`/`content`/`savedAt`）を後方互換で追加する。現行の`content`は常に最新の確定版として保持する

## 段階5「/memo」ゴミ箱の論理削除と完全削除

PO承認済み。論理削除は`trashedAt`等の専用フィールドを持たず、ルート予約フォルダ`MEMO_TRASH_ID`への再親化だけで表現する。

- `MEMO_TRASH_ID`は既存のピン止め・お気に入り・メモと同列の4件目の予約フォルダとする。`enforce_reserved_folders`へ定義を追加し、rename/remove/moveの全予約IDガード、起動時コメント、フロント定数、編集ビューの操作対象外判定を同期して更新する
- ゴミ箱はデータ上はルート直下に置くが、メモ編集ビューでは「メモ」直下の最下行として表示合成する。予約フォルダの保存順に表示位置を依存させない
- 既存の`is_descendant_of`は、ゴミ箱配下判定および完全削除対象の子孫収集に再利用する
- `move_favorite_node_to`はお気に入りツリーだけを移動先に許可するため流用しない。メモ用の制約を持つ`move_memo_node_to`を新設する。D&Dによる通常ツリーへの再親化は復元として扱い、専用の復元操作は設けない
- ゴミ箱外からのDeleteは確認なしでゴミ箱へ移動する。ゴミ箱配下からのDeleteは確認なしで完全削除する。フォルダの完全削除では子孫のmemo node IDを収集し、対応する`MemoDocument`も同一操作で削除して孤児本文を残さない
- ゴミ箱配下は`/memo`閲覧ビューの一覧・横断検索から常に除外し、本文への編集導線も表示しない

## 段階5「/memo」編集ツリーの共通化境界

PO承認済み。`FavoriteEditTree`全体を共通コンポーネント化せず、ツリー操作の純粋ロジックと入力部品だけを抽出する。

- `src/lib/nodeTree.ts`の`groupNodesByParent`/`walkGroupedTree`は既存のまま再利用する
- `useFavoriteEditSelection`は、行型と固定先頭行を引数化した`useTreeEditSelection`へ一般化する。お気に入り・メモの編集ビューはそれぞれ独立した選択ドメインを渡す
- `FavoriteEditTree.tsx`から`shouldStopEditInputKeyPropagation`、D&Dの`dropPositionFromRatio`、循環参照判定、`computeMoveTarget`を、root IDと行の最小契約を引数に取る純粋ユーティリティとして抽出する
- インラインのリネーム入力・フォルダ作成入力は、文言とコールバックをprops化して共有する
- 行描画、行アクション、データ取得は専用実装のままにする。お気に入り側のファイル存在警告・★解除・ファイルアイコンと、メモ側の本文編集導線・メモ作成・ゴミ箱の表示合成・論理/物理削除を条件propsで1コンポーネントへ集約しない
- この一般化は編集ビューのみに閉じ、`useSearch`の通常結果選択へ適用範囲を広げない。従って`/recent`を独自選択レーンへ分離する追加対応は不要（issue 0013はclose済み）

## 段階5「/memo」ResizableSplitPaneの抽出

PO承認済み。`ClipboardPanel`・`OcrPreview`・`/memo`閲覧ビューで共用する左右分割表示部品`ResizableSplitPane`を抽出する。

- 部品は`initialLeftWidth`、左ペイン最小幅150px、左ペイン最大幅はコンテナ幅の60%、ドラッグ終了時の`onResizeEnd`を持つ。永続化は親コンポーネントの責務とする
- OCRは50:50開始・非永続、クリップボードとメモはpx幅をそれぞれ独立キーで永続化する。メモのキーは`memoPaneWidth`とする
- ドラッグ中に部品がアンマウントされた場合にも、`document.body`のcursorとuserSelectをcleanupで必ず復元する

## 段階5「/memo」実装着手前の適用範囲

上記の設計事項はPO承認済みだが、この時点では実装しない。500_リリース前作業での`docs/internal-design/*.md`および`AGENTS.md`への正式反映も別指示とし、本トピック群はDESIGN_LOG.mdで保持する。
