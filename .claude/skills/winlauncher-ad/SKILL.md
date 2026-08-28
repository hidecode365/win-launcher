---
name: winlauncher-ad
description: "WinLauncher(Tauri v2/React/TypeScript/Rust製のWindows 11向けキーボードランチャー、GitHub hidecode365/win-launcher)のアプリ開発(AD)Skill。要件の事前調査・解釈確認、設計案への批評、実装、バグ修正、リリース前のドキュメント反映、リリース実行など、実際にコード/ドキュメントの変更や実行を伴うAD工程の作業を進めるときは必ずこのSkillを使うこと。指示の発信者がMG(管理担当)かPO(プロダクトオーナー)かは問わない — 明示的な調査・実装・実行の指示があるかどうかで判断する。単に質問に答える・雑談する・アイデアを相談するだけの場合は使わなくてよい。"
---

# WinLauncher アプリ開発Skill(AD)

WinLauncherはPOがソロ開発しているTauri v2 + React + TypeScript + Rust製のWindows 11向けキーボードランチャーアプリ。開発は「PO／MG（管理担当）／AD（このリポジトリでの作業）／SD」の体制で進める。このSkillはAD側の役割を担うときの、工程別・工程横断の実施要領をまとめる。

コードに紐づく技術的な実装パターン・アーキテクチャ上の落とし穴・常時ガードレール（言語方針・ログ出力方針・テストに関する制約・コマンド実行と承認等）は`AGENTS.md`（`CLAUDE.md`から`@AGENTS.md`でimportされる）が正本。このSkillはAD側の工程別実施要領・運用手順のみを扱い、技術詳細を重複して持たない。

参照ファイルはMG側（`../mng`）の工程定義表と同じ番号体系で整理してある。工程別のファイルは`references/process/`配下に`ad_app_連番_工程名.md`、工程をまたいで使うファイルは`references/`直下に`ad_app_900_トピック名.md`として置く。全体の工程定義表は`WORKFLOW.md`（MG側リポジトリ`../mng/WORKFLOW.md`）を参照。

## 発信者について

この工程はMGからのhandoff経由で開始されるのが通常だが、MGが何らかの理由で機能しない場合等、POから直接明示的な指示を受けて着手してもよい。判断軸は「発信者がMGかPOか」ではなく「対象・範囲が明確な実行指示を受けているか」。特に配布物を公開する高リスク操作（600_リリース等）は、発信者を問わず着手前に対象バージョン・変更内容を提示し実行承認を得ること。

## どの参照ファイルを読むか

タスクの種類に応じて、該当する工程別ファイルと工程横断ファイルだけを読むこと。全部読む必要はない。

### 工程別(`references/process/`配下)

| 依頼内容 | 読むファイル |
|---|---|
| 要件の事前調査・解釈確認の依頼を受けた | `process/ad_app_100_requirements.md` |
| 設計案への批評・懸念点の指摘を求められた | `process/ad_app_200_design.md` |
| 実装プロンプトを受けて実装する | `process/ad_app_300_implementation.md` |
| 動作確認のズレ・不具合調査を依頼された | `process/ad_app_400_test-bugfix.md` |
| `DESIGN_LOG.md`の内容を`AGENTS.md`・`docs/internal-design/*.md`へ反映する依頼を受けた | `process/ad_app_500_pre-release.md` |
| リリース実行の明示的指示を受けた（署名付きビルド〜GitHub Release作成） | `process/ad_app_600_release.md` |

### 工程横断(`references/`直下、900番台)

| 知りたいこと | 読むファイル |
|---|---|
| MGからの指示・報告の確認方法、着手・完了報告の書き方 | `ad_app_900_handoff-protocol.md` |
| `mng/issues/`配下のissue管理の運用ルール・ADの編集範囲 | `ad_app_900_issue-management.md` |
| 論理参照の解決先、ドキュメント3層（要件定義書／外部設計書／内部設計書）の使い分け | `ad_app_900_doc-structure.md` |
| 設定タブの追加・削除・改名など、コードから読み取れる派生情報を変更した際に更新すべき箇所 | `ad_app_900_sync-checklist.md` |
| 不具合調査・修正の進め方（7ステップ） | `ad_app_900_bugfix-flow.md` |
| WinGetパッケージの新バージョン申請手順 | `ad_app_900_winget-application.md` |
| ディレクトリ構成・技術スタック・Tauriプラグイン一覧 | `ad_app_900_architecture-overview.md` |
| Tauriコマンド（Rust⇄フロントエンドのIPC）一覧 | `ad_app_900_tauri-commands.md` |
| フロントエンドのhooks/コンポーネント構成 | `ad_app_900_frontend-structure.md` |

工程別ファイルは工程横断ファイルへのポインタを持つ。工程別ファイルを読んだうえで、そこから参照されている900番台のファイルもあわせて読むこと。

### 実装パターン別(`references/patterns/`配下)

コード変更（デザイン調整・バグ修正・新機能実装を問わない）を行う際、変更対象の画面・機能に対応するファイルだけを読む。**関係の無いトピックのファイルは読まなくてよい**（例: 配色やスペーシングだけを変える作業では、対応する1トピック以外は不要）。各ファイルはそのトピックの実装原則を数行〜十数行に凝縮したもので、**背景（現状仕様の詳細・経緯・却下案・不具合の記録）は各ファイル内の「→ 詳細」リンク先（`docs/internal-design/*.md`）で確認する**。原則だけでは実装の詳細・過去の失敗パターンを把握しきれない場合がある。

ポインタ先が `external-design/`（太字で示す）になっている原則は PO 承認済みの設計事項であり、AD の判断だけで変更しないこと（変更が必要と判断した場合は 200_設計 工程として提起する）。

| 対象の画面・機能 | 読むファイル |
|---|---|
| ウィンドウの表示位置・透過・角丸・シャドウ・起動ホットキー | `patterns/window-and-hotkey.md` |
| ウィンドウの表示/非表示/クローズ処理、L1画面遷移、Ctrl+D、モーダルのキー操作 | `patterns/window-lifecycle.md` |
| 検索結果一覧の選択状態・行のDOM構造・行種別の追加 | `patterns/result-list-and-selection.md` |
| フッターのキー操作ヒント表示 | `patterns/status-footer.md` |
| 設定パネルの共通UI（タブ・インデント・保存モデル・バリデーション） | `patterns/settings-panel-architecture.md` |
| ファイル検索・frecency・検索フォルダの詳細設定（拡張子フィルタ等） | `patterns/file-search-and-frecency.md` |
| ピン止め・お気に入り・メモのデータ構造（FavoriteNode・MemoDocument） | `patterns/favorites-data-model.md` |
| ピン止め・お気に入りのアイコン・ツールチップのデザイン | `patterns/favorites-ui-iconography.md` |
| 共有UIコンポーネント・semantic token・デザインシステム全般 | `patterns/shared-ui-system.md` |
| 計算機能・システムコマンド・"/" プレフィックスコマンド候補 | `patterns/calc-and-prefix-commands.md` |
| クリップボード履歴・OCR画面 | `patterns/clipboard-and-ocr.md` |
| 最近使ったファイル一覧（`/recent`） | `patterns/recent-files.md` |
| パス貼り付けによる検索フォルダ管理（機能1〜4） | `patterns/path-paste.md` |
| システムトレイ・自動起動・自動アップデート | `patterns/tray-autostart-updater.md` |
| 新しい依存ライブラリ・Tauriプラグインの採用判断 | `patterns/dependencies.md` |
