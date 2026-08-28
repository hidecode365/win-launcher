# 変更時の同期チェックリスト

コードから読み取れる情報（ファイル名の一覧・タブ名の一覧・設定項目名の一覧等）を `AGENTS.md`・`00-requirements.md` に書き写すと、コード側だけが変更されドキュメント側の更新が漏れる「派生情報の同期漏れ」が発生する。実際に、設定画面のカテゴリナビ一覧が2箇所に重複して存在し、互いに異なる不完全なリストになっていた事例があった（詳細は [settings-panel-architecture.md](../../../../docs/internal-design/settings-panel-architecture.md#settings-tab-list-duplication-incident) の「設定画面カテゴリナビ一覧の重複事例」を参照）。この節はその再発防止のための原則を定める。

- **原則**：コードから読み取れる情報は、原則として `AGENTS.md`・`00-requirements.md` に重複して書かない。書く場合は正本を1箇所だけ定め、他の箇所は参照に留める（同じ一覧を2箇所以上に独立して書かない）
- **表記の正本はコード**（タブラベル等の実際の文字列）であり、`00-requirements.md` と `AGENTS.md`／`docs/internal-design/*.md` はそれに従う。表記を変更する場合は、コード・`00-requirements.md`・該当する `docs/internal-design/*.md` の3つを同時に更新する
- **設定画面のタブを追加・削除・改名した場合に更新が必要な箇所**（すべて同時に更新すること）：
  - コード：`SettingsPanel.tsx` の `SettingsTab` 型・`SETTINGS_TABS` 配列・分岐、対応する `XxxSettings.tsx`
  - `00-requirements.md`「設定画面」節のカテゴリ一覧
  - `docs/internal-design/settings-panel-architecture.md` のカテゴリナビ一覧（正本1箇所。`#settings-tabs-list` を参照）
  - `AGENTS.md` のディレクトリ構成図（タブの実体ファイルのみ。共通コンポーネントは対象外。次項を参照）
- **ディレクトリ構成図は「全体像の把握」用の簡略版であり、網羅性の責任を持たない。** コンポーネントファイルを追加した場合、それがタブの実体でなければ構成図への追記は不要（本文の該当節・`docs/internal-design/*.md` で説明すればよい）。既存の共通コンポーネント（`SettingsIndent.tsx`／`SettingsGroup.tsx`／`SettingsSaveBar.tsx`／`FeatureBlock.tsx`／`FolderDetailSettingsModal.tsx`／`ExtensionFilterEditor.tsx`／`Tooltip.tsx` 等）も同様の理由で構成図には列挙していない
- **設定項目を追加・変更した場合（タブ自体は増減しない場合）に更新が必要な箇所**：
  - コード：該当する `XxxSettings.tsx`、`AppSettings`（`types.ts`）のフィールド、Rust側の `set_*` コマンド
  - `00-requirements.md`「設定画面」節の該当タブの記述
  - `AGENTS.md`／`docs/internal-design/*.md` は原則として更新不要（仕様は `00-requirements.md` を参照する構成にしたため。実装上の技術的な注意点・判断根拠が新たに生じた場合のみ、該当する `docs/internal-design/*.md` にその部分だけを追記する）
- **AGENTS.md・docs/internal-design/*.md には「どう作られているか」を書き、「何ができるか」は `requirements/00-requirements.md` に書く。** PO 承認を要する設計事項（アーキテクチャ判断・状態遷移・データ構造の定義）は `external-design/*.md` に書く。3層のどこに書くべきかは [ad_app_900_doc-structure.md](ad_app_900_doc-structure.md) の「ドキュメント構成（3層）」節の表に従い、複数の層に同じ内容を書かない
- **パターンファイルとdetail docのアンカー同期ルール**（実装原則を`winlauncher-ad` Skillの`references/patterns/*.md`へ切り出したことに伴うルール。2026-08-28、旧「AGENTS.md設計原則ダイジェスト」から移行）：`references/patterns/*.md`の各箇条書きは、対応する `docs/internal-design/*.md` 内の見出しに振った `<a id="kebab-case-english-id"></a>` アンカーへのポインタ（`→ 詳細: [表示名](docs/internal-design/xxx.md#anchor-id)`）を必ず持つ。以下を同時に守ること：
  - アンカーIDは見出し文言の自動スラッグ化に頼らず、見出し直前に `<a id="...">` を明示的に振る（英語kebab-case）。見出しの日本語文言をリネームしてもアンカーIDは変えない（アンカーIDと見出し文言は独立して管理する）
  - `docs/internal-design/*.md` 側でアンカーIDを変更・削除した場合、対応する `references/patterns/*.md` 側のポインタを同時に更新する（放置すると壊れたリンクが残る）
  - パターンファイル側の箇条書きの順序は、対応する detail doc 内のアンカー出現順と一致させる（両ファイルの構造的な対応関係を保ち、片方だけ並び替えて食い違う事故を防ぐため）
