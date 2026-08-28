# 論理参照の解決先(2026-08-08導入)

`docs/internal-design/*.md`・`.claude/skills/winlauncher-ad/references/process/ad_app_*.md`内で以下の形式の参照が出てきた場合、実体はこのリポジトリの外、MG側Vault(`../mng/`)にある(MGが正本管理)。パスを持たない論理参照にすることで、将来置き場所が変わっても書き換えが1箇所で済む設計。

- `external-design/ファイル名#アンカー` → `../mng/docs/app/external-design/ファイル名`
- `requirements/ファイル名#アンカー` → `../mng/docs/app/requirements/ファイル名`
- `WORKFLOW.md#アンカー` → `../mng/WORKFLOW.md`

逆に、AD実施要領(`ad_app_*.md`)の実体はこのリポジトリの`.claude/skills/winlauncher-ad/references/process/`にある(app側が正本)。

# ドキュメント構成（3層）

設計ドキュメントは、**PO のレビュー対象かどうか**を基準に3層に分かれる。どの層に書くべきかを常に意識すること。

| 層 | 場所 | 内容 | PO のレビュー | 更新する工程 |
| --- | --- | --- | --- | --- |
| 要件定義書 | `requirements/` | 「何ができるか」（機能要件・仕様） | **濃厚にレビューする** | 100_要件定義 |
| 外部設計書 | `external-design/` | PO 承認を要する設計事項（アーキテクチャ判断・状態遷移・データ構造の定義） | **濃厚にレビューする** | 200_設計（PO 承認を得る） |
| 内部設計書 | [docs/internal-design/](../../../../docs/internal-design/) | 「どう作られているか」（実装パターン・コード上の規約・不具合の経緯） | **基本見ない**（MG と AD が責任を持つ） | 500_リリース前作業（実装を踏まえて最新化） |

外部設計書は4章構成で、章立ての理屈は「動き → 見た目 → 持ち方 → 土台」：

- `external-design/01-screen-transitions.md` — 画面遷移設計（モーダルのキー操作原則・モード共存/排他一覧・view/modal 状態遷移一覧）
- `external-design/02-list-and-selection.md` — 一覧・選択設計（一覧データ構造の3層定義・選択モデルの原則）
- `external-design/03-data-model.md` — データモデル設計（**現時点では器のみ。内部設計書からの節の移設は次回作業**）
- `external-design/04-platform-policies.md` — 技術方針（**現時点では器のみ。同上**）

**同じ内容を複数の層に重複して書かない。** 上位層に書いた内容は、下位層からは参照リンクのみを置く。
