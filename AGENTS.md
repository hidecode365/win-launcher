# WinLauncher — 設計方針

## 開発フロー

詳細は `WORKFLOW.md` を参照。

## 論理参照の解決先(2026-08-08導入)

`docs/internal-design/*.md`・`docs/process/ad_app_*.md`内で以下の形式の参照が出てきた場合、実体はこのリポジトリの外、MG側Vault(`../mng/`)にある(MGが正本管理)。パスを持たない論理参照にすることで、将来置き場所が変わっても書き換えが1箇所で済む設計。

- `external-design/ファイル名#アンカー` → `../mng/docs/app/external-design/ファイル名`
- `requirements/ファイル名#アンカー` → `../mng/docs/app/requirements/ファイル名`
- `WORKFLOW.md#アンカー` → `../mng/WORKFLOW.md`

逆に、AD実施要領(`docs/process/ad_app_*.md`)の実体はこのリポジトリの`docs/process/`にある(app側が正本)。

## MGからの指示の確認方法

MGからの指示・報告のやり取りは、このリポジトリ内ではなく
`../mng/handoff/ad.md`（mngリポジトリ配下）に書き込まれる。「MGの指示を確認して」
「対応して」などと言われたら、まずこのファイルを読むこと。着手報告・完了報告も
同じファイルの該当欄に書き込む。チャットでの完了回答は、完了報告の記入後に行う。

`DESIGN_LOG.md`を含むドキュメント編集タスクでは、完了報告の前に必ず `git add` → `git commit` → `git push` を実施し、pushされたことを確認する。未コミット・未pushの編集を完了として報告しない。

MG・ADは、割り当てられた作業だけでなく、気づいた工程・品質上の改善点をhandoffで相互に簡潔に指摘し合う。単発の指摘はその場の共有に留め、同種の問題が繰り返される場合にのみ恒久的な手順・記録を追加する。LEANと品質担保の優先順位に迷う場合は、独断で手続きを増やさずPOへ相談する。

### 未完了タスクの継続

- 検証・自己点検で未達を見つけた場合、外部判断待ち・必要な承認待ち・安全上の停止条件のいずれにも当たらなければ、handoffへの中間報告だけで作業を終了せず、そのまま是正と再検証を継続する。
- 完了回答を出す直前に、指示の完了条件を項目ごとに照合する。未達が一つでもあれば完了報告にしない。作業を継続不能な正当な理由がある場合だけ、未達項目・停止理由・再開時の最初の操作をhandoffに記録する。

## issue管理(mng/issues/)の確認・更新方法

アプリ開発のissueは、MG側Vaultの `../mng/issues/` で管理する。MGからissueに関する指示を受けた場合は、まず対象issueファイルを読むこと。

ADは、担当issueについて次を直接更新してよい。

- `status`、`updated`、`next_action`
- 進捗(ToDo)チェックリスト
- クローズ時の記録

状態を変更する場合は、`updated` と `next_action` も同時に更新する。`closed` にする場合は、確認者・確認日・関連コミット等のクローズ根拠を「クローズ時の記録」に残す。POの受入・判断を工程ゲートとして必要とする変更は、該当するPOゲートが完了するまでcloseしない。判断に迷う場合は `in-progress` のまま `next_action` を「PO/MGのclose可否確認待ち」とし、`../mng/handoff/ad.md` でMGへ確認する。

起票・採番・`_template.md`・`index.md` のDataviewクエリの変更はMG専属とし、ADは直接変更しない。上記の運用ルール(編集範囲・close基準等)は、この節自体を正本とする。

## ドキュメント構成（3層）

設計ドキュメントは、**PO のレビュー対象かどうか**を基準に3層に分かれる。どの層に書くべきかを常に意識すること。

| 層 | 場所 | 内容 | PO のレビュー | 更新する工程 |
| --- | --- | --- | --- | --- |
| 要件定義書 | `requirements/` | 「何ができるか」（機能要件・仕様） | **濃厚にレビューする** | 100_要件定義 |
| 外部設計書 | `external-design/` | PO 承認を要する設計事項（アーキテクチャ判断・状態遷移・データ構造の定義） | **濃厚にレビューする** | 200_設計（PO 承認を得る） |
| 内部設計書 | [docs/internal-design/](docs/internal-design/) | 「どう作られているか」（実装パターン・コード上の規約・不具合の経緯） | **基本見ない**（MG と AD が責任を持つ） | 500_リリース前作業（実装を踏まえて最新化） |

外部設計書は4章構成で、章立ての理屈は「動き → 見た目 → 持ち方 → 土台」：

- `external-design/01-screen-transitions.md` — 画面遷移設計（モーダルのキー操作原則・モード共存/排他一覧・view/modal 状態遷移一覧）
- `external-design/02-list-and-selection.md` — 一覧・選択設計（一覧データ構造の3層定義・選択モデルの原則）
- `external-design/03-data-model.md` — データモデル設計（**現時点では器のみ。内部設計書からの節の移設は次回作業**）
- `external-design/04-platform-policies.md` — 技術方針（**現時点では器のみ。同上**）

**同じ内容を複数の層に重複して書かない。** 上位層に書いた内容は、下位層からは参照リンクのみを置く。

## 変更時の同期チェックリスト

コードから読み取れる情報（ファイル名の一覧・タブ名の一覧・設定項目名の一覧等）を `CLAUDE.md`・`00-requirements.md` に書き写すと、コード側だけが変更されドキュメント側の更新が漏れる「派生情報の同期漏れ」が発生する。実際に、設定画面のカテゴリナビ一覧が2箇所に重複して存在し、互いに異なる不完全なリストになっていた事例があった（詳細は `docs/internal-design/settings-panel-architecture.md` の「設定画面カテゴリナビ一覧の重複事例」を参照）。この節はその再発防止のための原則を定める。

- **原則**：コードから読み取れる情報は、原則として `CLAUDE.md`・`00-requirements.md` に重複して書かない。書く場合は正本を1箇所だけ定め、他の箇所は参照に留める（同じ一覧を2箇所以上に独立して書かない）
- **表記の正本はコード**（タブラベル等の実際の文字列）であり、`00-requirements.md` と `CLAUDE.md`／`docs/internal-design/*.md` はそれに従う。表記を変更する場合は、コード・`00-requirements.md`・該当する `docs/internal-design/*.md` の3つを同時に更新する
- **設定画面のタブを追加・削除・改名した場合に更新が必要な箇所**（すべて同時に更新すること）：
  - コード：`SettingsPanel.tsx` の `SettingsTab` 型・`SETTINGS_TABS` 配列・分岐、対応する `XxxSettings.tsx`
  - `00-requirements.md`「設定画面」節のカテゴリ一覧
  - `docs/internal-design/settings-panel-architecture.md` のカテゴリナビ一覧（正本1箇所。`#settings-tabs-list` を参照）
  - `CLAUDE.md` のディレクトリ構成図（タブの実体ファイルのみ。共通コンポーネントは対象外。次項を参照）
- **ディレクトリ構成図は「全体像の把握」用の簡略版であり、網羅性の責任を持たない。** コンポーネントファイルを追加した場合、それがタブの実体でなければ構成図への追記は不要（本文の該当節・`docs/internal-design/*.md` で説明すればよい）。既存の共通コンポーネント（`SettingsIndent.tsx`／`SettingsGroup.tsx`／`SettingsSaveBar.tsx`／`FeatureBlock.tsx`／`FolderDetailSettingsModal.tsx`／`ExtensionFilterEditor.tsx`／`Tooltip.tsx` 等）も同様の理由で構成図には列挙していない
- **設定項目を追加・変更した場合（タブ自体は増減しない場合）に更新が必要な箇所**：
  - コード：該当する `XxxSettings.tsx`、`AppSettings`（`types.ts`）のフィールド、Rust側の `set_*` コマンド
  - `00-requirements.md`「設定画面」節の該当タブの記述
  - `CLAUDE.md`／`docs/internal-design/*.md` は原則として更新不要（仕様は `00-requirements.md` を参照する構成にしたため。実装上の技術的な注意点・判断根拠が新たに生じた場合のみ、該当する `docs/internal-design/*.md` にその部分だけを追記する）
- **CLAUDE.md・docs/internal-design/*.md には「どう作られているか」を書き、「何ができるか」は `requirements/00-requirements.md` に書く。** PO 承認を要する設計事項（アーキテクチャ判断・状態遷移・データ構造の定義）は `external-design/*.md` に書く。3層のどこに書くべきかは「ドキュメント構成（3層）」節の表に従い、複数の層に同じ内容を書かない
- **ダイジェストとdetail docのアンカー同期ルール**（原則ダイジェスト方式を採用したことに伴う新設ルール）：`AGENTS.md`「設計原則ダイジェスト」節の各箇条書きは、対応する `docs/internal-design/*.md` 内の見出しに振った `<a id="kebab-case-english-id"></a>` アンカーへのポインタ（`→ 詳細: [表示名](docs/internal-design/xxx.md#anchor-id)`）を必ず持つ。以下を同時に守ること：
  - アンカーIDは見出し文言の自動スラッグ化に頼らず、見出し直前に `<a id="...">` を明示的に振る（英語kebab-case）。見出しの日本語文言をリネームしてもアンカーIDは変えない（アンカーIDと見出し文言は独立して管理する）
  - `docs/internal-design/*.md` 側でアンカーIDを変更・削除した場合、`CLAUDE.md` 側の対応するポインタを同時に更新する（放置すると壊れたリンクが残る）
  - ダイジェスト側の箇条書きの順序は、対応する detail doc 内のアンカー出現順と一致させる（両ファイルの構造的な対応関係を保ち、片方だけ並び替えて食い違う事故を防ぐため）

## 言語方針

- ユーザーへの応答・進捗報告・要約・提案は、常に日本語で行うこと
- コード自体のコメントや変数名、コミットメッセージ等、英語であるべき箇所は従来通り英語のままでよい
- リポジトリ内の各種ドキュメント（README・リリースノート等）をどちらの言語で書くかは、個別の慣習ではなく「ドキュメント言語方針」節の表に従う

## ドキュメント言語方針

リポジトリ内の各ドキュメント・告知文が英語／日本語のどちらで書かれるべきかを以下に一覧化する。新規ドキュメントを追加する場合もこの方針に従うこと。

| ドキュメント | 言語 | 備考 |
| --- | --- | --- |
| README.md | 英語のみ | 見出し・本文とも英語で統一。日本語混在不可 |
| GitHub Releases 本文 | 英語 | `gh release create` の本文 |
| アプリ内更新ダイアログ（latest.json） | 日本語 | last-release-notes.md の内容を反映 |
| last-release-notes.md | 日本語 | latest.json 用の一時保存ファイル |
| 00-requirements.md | 日本語 | 仕様書 |
| CLAUDE.md／docs/internal-design/*.md | 日本語 | AD向けコンテキストファイル自体 |
| X（@hidecode365）告知文 | 日本語 | 140字以内 |
| GitHub Issueテンプレート | 英日併記 | 項目名は英語+日本語併記 |

## テストに関する制約

- `npm run tauri dev` でアプリを起動した後、PowerShell やスクリーンキャプチャ等を用いた自動GUIテストは一切実施しないこと
- 動作確認は `cargo build` や `tsc` などの静的なビルド検証までとし、実際のGUI操作・画面キャプチャ・自動操作によるテストはユーザーが手動で行う
- ビルドが通り、アプリが起動できることを確認した時点で、ユーザーに動作確認を依頼して終了すること
- 実装作業において、`npm run tauri dev` の起動自体を行わない（既存プロセスの Kill 承認が発生し手間になるため）。ビルド確認は `cargo build` までとし、アプリの起動・動作確認はユーザー自身が行う
  - 実装プロンプトに明示的な起動指示がない限り、`npm run tauri dev` を実行しないこと
  - ビルドエラーが発生した場合は、その都度ユーザーと相談する

## ログ出力方針

- `console.error` / `console.warn`：常に残す。実害（起動失敗・保存失敗等）の把握のため、本番ビルドでも出力され続ける必要がある
- `console.debug` / `console.log`：開発時の一時調査用。`vite.config.ts` の本番ビルド設定（Terser の `compress.pure_funcs`。「ビルド」節を参照）により `npm run tauri build` 実行時に呼び出しごと自動的に削除されるため、**調査用ログは削除し忘れを気にせず積極的に仕込んでよい**（ファイルパス等の情報を含むログも、本番バイナリには含まれない）
  - `npm run tauri dev` では Terser を通さないため、これらのログはそのまま出力される（devtools コンソールで調査可能）
  - 削除されるのは静的な `console.debug(...)` / `console.log(...)` の呼び出し式そのものであり、変数へ代入した参照（例: `const log = console.debug; log(...)`）等の間接呼び出しは対象外になる点に注意する（通常の直接呼び出しの書き方をしていれば問題ない）
- `ErrorBoundary`（`src/components/ErrorBoundary.tsx`）：上記の調査用ログとは異なり、**開発・本番を問わず常時有効な恒久的な安全装置**。描画中の例外を捕捉し、画面が白紙のまま固まって見える状態を避けてエラーメッセージを表示する。Terser の除去対象ではなく、削除・無効化を前提としない

## バグ修正フロー

不具合の調査・修正にあたっては、以下の7ステップを基本とする。

1. **症状の再現条件を切り分ける**：毎回必ず起きるのか、特定の条件（ファイル種別・処理の重さ等）に依存するのかを最初に明確化する。曖昧なまま次のステップに進まない
2. **直接原因を特定する**：「なぜ起きたか」を技術的に一つに絞り込む
3. **横並び調査**：特定した原因パターンが、他のどの機能・どのアクションにも当てはまるかを、コードベース上で必ず全数確認する。思いつく範囲でのリストアップで済ませず、grep 等で機械的に洗い出すこと
4. **原因の性質を判定する（個数によらず初回から必ず行う）**：「そのアクション固有の実装ミスなのか」「今回使った設計パターンそのものが持つ構造的な弱さなのか」を判定する。「同種の個別対応が何個目か」は判断基準にしない。後者（構造的な弱さ）に該当すると判断したら、たとえ初回のバグであっても全体設計の見直しを検討する。個別対応で済ませる場合は、「なぜ全体設計の見直しをしなかったか」を判断根拠として明示すること
5. **個別対応 or 全体設計見直しの実施**：全体設計を見直す場合は、設計案を複数比較した上で「なぜその設計が良いか」を言語化し、対象範囲全体に一括適用する。既存の個別対応（その場しのぎのフラグ・ガード等）のうち、新しい設計に統合できるものは削除し、複雑化を解消する
6. **検証範囲の明示**：3の洗い出し結果に基づき、確認すべき項目をチェックリスト化してから動作確認を依頼する
7. **知見の型化**：CLAUDE.md／`docs/internal-design/*.md` への追記は、個別の不具合事例の列挙ではなく、再利用可能な「設計原則」として記載する。個別の不具合事例そのもの（症状・原因・検討した設計案・対応）は該当する `docs/internal-design/*.md` の「経緯」節に記録し、`CLAUDE.md` にはそこから抽出した原則のみをダイジェストとして残す

基本姿勢：症状ごとの場当たり的なパッチ（モグラ叩き）は最も避けるべき対応であり、急がば回れで根本原因・共通設計に向き合うことを常に優先する。

上記4は単一のバグ調査内での判断だが、単一の調査に留まらず、別々のやり取り（チケット）にまたがって同種の修正指示（サイズ・間隔・配色等の微調整）を2回以上受けた場合も、同じ判断が必要になる。この場合、3回目の指示を待たずに、対症療法（個別の値のその都度調整）を続けるべきか、共通化・構造的な作り替えを検討すべきかをAD自身から提案すること。提案の際は、対象範囲（影響を受けるファイル）とおおよその実装コストの見立ても添える。

## コマンド実行と承認

- 作業ディレクトリ内で完結し、通常の開発作業の範囲に収まる操作は、必要に応じて自律的に実行してよい。これにはファイル編集、検証、整形、ローカルのバージョン管理操作などを含む。
- 作業ディレクトリの外部環境、外部サービス、または第三者が利用する公開状態へ影響を与える操作は、実行前に必ずユーザーの承認を得る。公開、配布、デプロイ、リモート環境の変更などが該当する。
- データ削除、大量変更、履歴改変その他、復旧が困難または影響範囲が大きい操作も、対象がローカルであっても実行前にユーザーの承認を得る。
- 承認が必要な外部操作または高影響操作は、通常操作と同じコマンド列やスクリプトに含めず、承認対象と分かる独立したコマンドとして実行する。未承認の操作を承認不要のコマンドへ連結・埋め込みして、この承認手順を回避してはならない。
- Codexで作業する場合、`git push` はサンドボックス外で実行し、実行直前に個別の承認を求める。通常のCodexサンドボックス内では Schannel の `SEC_E_NO_CREDENTIALS` が発生する一方、承認付きのサンドボックス外実行では GitHub への HTTPS 接続および push が成功したことを確認済み。この知見はCodexの実行環境に限るものであり、Claude Codeで作業する場合には適用しない。

## 概要

Windows 11 向けキーボードランチャー。Alt+Space でウィンドウをトグルし、
設定済みの複数フォルダ内のファイルをインクリメンタル検索して起動する。
検索ボックスに数式を入力すると計算結果を表示し、クリップボードにコピーできる。

## アーキテクチャ

> この構成図は主要なコンポーネントのみを示す簡略版であり、網羅性は保証しない。共通コンポーネントの詳細は本文の各節・`docs/internal-design/*.md` を参照（詳細は「変更時の同期チェックリスト」節を参照）。

```text
win-launcher/
├── src/                    # React フロントエンド
│   ├── main.tsx
│   ├── App.tsx             # ルートコンポーネント。フック・コンポーネントを組み合わせる構成のみを担う
│   ├── types.ts             # フロントエンド全体で共有する型・定数（AppSettings 等）
│   ├── lib/
│   │   ├── format.ts        # フォーマット系の純粋関数（formatTimestamp 等）
│   │   └── window.ts        # hideWindow（メインウィンドウ非表示）
│   ├── hooks/
│   │   ├── useSettings.ts    # AppSettings・検索フォルダの読み込み・保存
│   │   ├── useHotkey.ts      # 起動ホットキーの変更（set_hotkey）
│   │   ├── useSearch.ts      # クエリ・検索/計算/システムコマンド判定・frecency・起動系コマンド
│   │   ├── useClipboard.ts   # クリップボード履歴の記録・永続化・呼び出し
│   │   ├── useOcr.ts         # OCR状態管理（ローディング・結果・エラー・クリア）
│   │   └── useUpdater.ts     # アップデートダイアログの状態管理・check_for_update/download_and_install_update呼び出し
│   ├── components/
│   │   ├── SearchBox.tsx           # 検索入力欄（ドラッグ領域・歯車ボタン含む）。画像ペーストを検出して onImagePaste を呼ぶ。それ以外の貼り付けは onPathPaste を呼ぶ
│   │   ├── OcrPreview.tsx          # OCR結果プレビュー（編集可能テキストエリア＋コピー・閉じるボタン）
│   │   ├── ResultList.tsx          # 計算結果/システムコマンド候補/ファイル検索結果/パス貼り付け候補行のリスト
│   │   ├── PathPasteWizard.tsx     # パス貼り付け機能2（ショートカット配置）のミニウィザード（フォルダ選択・名前編集ステップ）
│   │   ├── ClipboardPanel.tsx      # クリップボード履歴モードの2カラムパネル
│   │   ├── WebSearchRow.tsx        # 「Googleで〇〇を検索」行
│   │   ├── SystemCommandModal.tsx  # システムコマンドの確認モーダル
│   │   ├── StatusFooter.tsx        # フッターのキー操作ヒント
│   │   ├── FeatureToggle.tsx       # 設定パネル共通の ON/OFF トグル
│   │   ├── SettingsPanel.tsx       # 設定パネル全体（タブ構成）
│   │   ├── GeneralSettings.tsx     # 全般タブ（ホットキー）
│   │   ├── FileSearchSettings.tsx  # ファイル検索タブ
│   │   ├── FavoriteSettings.tsx    # お気に入りタブ
│   │   ├── MemoSettings.tsx        # メモタブ
│   │   ├── PathPasteSettings.tsx   # パス貼り付けタブ
│   │   ├── ConvertSettings.tsx     # 計算・変換タブ
│   │   ├── SystemCommandSettings.tsx # システムコマンドタブ
│   │   ├── WebSearchSettings.tsx   # Web検索タブ
│   │   ├── ClipboardSettings.tsx   # クリップボードタブ
│   │   ├── RecentFilesSettings.tsx # 最近使ったファイルタブ
│   │   ├── OcrSettings.tsx         # OCRタブ
│   │   ├── AboutSettings.tsx       # このアプリについてタブ
│   │   └── UpdateDialog.tsx        # アップデート確認/ダウンロード中ダイアログ
│   └── styles.css
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # Rust バックエンド（全ロジック）
│   │   ├── recent_files.rs # 最近使ったファイル一覧の取得ロジック（Windows/Office Recent フォルダ・OneDrive パス解決）
│   │   └── path_paste.rs   # パス貼り付けによる検索フォルダ管理：CF_HDROP確認・テキストからの実在パス判定・`.lnk` 作成（IShellLinkW直接呼び出し）・連番付与ロジック
│   ├── capabilities/
│   │   └── default.json    # Tauri v2 権限設定
│   ├── icons/               # トレイ/アプリアイコン
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── scripts/
│   └── generate-latest-json.ps1  # リリース時に latest.json（Tauri Updater 用）を生成する
├── docs/
│   ├── design/               # 設計判断の詳細（現状仕様・経緯・却下案・不具合の記録）。詳細は「設計原則ダイジェスト」節を参照
│   └── process/              # 開発工程ごとのAD実施要領。詳細は WORKFLOW.md を参照
├── DESIGN_LOG.md             # 設計協議の一時記録（トピック単位、反映後にクリア）
└── CLAUDE.md                # 本ファイル（設計方針）
```

## 技術スタック

| 区分 | バージョン |
| --- | --- |
| Tauri | v2 |
| React | 18 |
| TypeScript | 5 |
| Tailwind CSS | 3 |
| Vite | 6 |

依存バージョンの更新状況・保留理由は [dependencies.md](docs/internal-design/dependencies.md#dependency-update-status) を参照。

## Tauri プラグイン

| プラグイン | 用途 |
| --- | --- |
| `tauri-plugin-global-shortcut` | グローバルホットキー（起動ホットキー） |
| `tauri-plugin-shell` | ファイル起動・Web検索の URL をデフォルトブラウザで開く（`open()`） |
| `tauri-plugin-autostart` | Windows スタートアップ登録 |
| `tauri-plugin-store` | 検索フォルダ・各機能 ON/OFF・ホットキー設定・ウィンドウサイズ・ファイル起動の frecency 履歴の永続化（`settings.json`）。frecency 履歴・ウィンドウサイズは Rust コマンドを介さず、フロントエンドが JS パッケージ `@tauri-apps/plugin-store` で直接読み書きする |
| `tauri-plugin-dialog` | フォルダ選択ダイアログ。**必ず Rust 側の Tauri コマンド（`pick_folder`）として実装し、`set_parent` で親ウィンドウを指定すること**（理由は [dependencies.md](docs/internal-design/dependencies.md#dialog-plugin-parent-window) を参照） |
| `tauri-plugin-clipboard-manager` | 計算結果のクリップボードコピー（Rust コマンド経由）。クリップボード履歴機能ではフロントエンドが JS パッケージ `@tauri-apps/plugin-clipboard-manager` で直接 `readText`/`readImage`/`writeImage` を呼ぶ |
| `tauri-plugin-process` | アプリケーションの再起動（`relaunch`） |
| `tauri-plugin-updater` | 自動アップデート（GitHub Releases + `latest.json` の確認・ダウンロード・インストール） |
| `tauri-plugin-notification` | パス貼り付け候補の操作（検索フォルダ追加・ショートカット配置・ピン止め・お気に入り）完了時の Windows トースト通知 |
| `tauri` (tray-icon feature) | システムトレイ常駐 |

プラグインの選定理由の詳細は [dependencies.md](docs/internal-design/dependencies.md#plugin-list-rationale) を参照。

## 設計原則ダイジェスト

以下は `docs/internal-design/*.md` から抽出した「今後の指針・再利用可能な原則」のみを収めたダイジェストである。**各原則の背景（現状仕様の詳細・経緯・却下案・不具合の記録）は必ずポインタ先で確認すること。** 原則だけでは実装の詳細・過去の失敗パターンを把握しきれない場合がある。

見出しは横断アーキテクチャ系5ファイル・機能単位系10ファイルの計15ファイルに対応する。**ポインタ先が `external-design/`（太字で示す）になっている原則は PO 承認済みの設計事項であり、AD の判断だけで変更しないこと**（変更が必要と判断した場合は 200_設計 工程として提起する）。

### ウィンドウ・ホットキー

→ 詳細: [window-and-hotkey.md](docs/internal-design/window-and-hotkey.md)

- ウィンドウは常に画面中央に表示し、位置は永続化しない。ウィンドウを表示するすべての箇所（グローバルホットキー／トレイ）で `show()` 直前に `window.center()` を呼ぶ。 → 詳細: [window-and-hotkey.md](docs/internal-design/window-and-hotkey.md#frameless-and-centering)
- 透過・角丸・シャドウ（`backgroundColor` alpha 0／DOM側 `background: transparent`／`tauri.conf.json` の `shadow: false`）の3点セットは個別に変更せず、常にセットで扱う。1つだけ変更すると角のアーティファクトが再発する。 → 詳細: [window-and-hotkey.md](docs/internal-design/window-and-hotkey.md#transparency-and-shadow)
- 新しいドラッグ可能領域を追加する場合は必ず `data-tauri-drag-region="deep"` を使う（値なしの bare 指定は子要素で発火しないため避ける）。 → 詳細: [window-and-hotkey.md](docs/internal-design/window-and-hotkey.md#basic-window-config)
- ウィンドウの位置は永続化しないが、サイズは永続化する（この非対称は意図的な仕様であり矛盾ではない）。 → 詳細: [window-and-hotkey.md](docs/internal-design/window-and-hotkey.md#resizing-and-size-persistence)
- ホットキー変更（`set_hotkey`）は unregister → register の順で行い、新ホットキーの register が失敗したら旧ホットキーを再登録して維持する。フロントエンドはライブキーキャプチャを行わず、修飾キーのチェックボックス＋通常キーのプルダウンからアクセラレータ文字列を直接組み立てる。 → 詳細: [window-and-hotkey.md](docs/internal-design/window-and-hotkey.md#hotkey-registration)

### ウィンドウのライフサイクル（表示・非表示・クローズ処理）

→ 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md)

- Ctrl+DはAppのwindowハンドラ1箇所で処理する。全画面ビューが独自の可視クエリを持つ場合は、画面固有のkeydownを追加せず`localQueryClearHandlerRef`へ消去処理を登録する。 → 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md#local-query-clear-dispatch)
- フォーカスアウトでの自動非表示は150msデバウンス＋再確認で行う。検索以外の全画面ビューでは `viewRef` を見て自動非表示を適用しない。 → 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md#focus-out-auto-hide)
- ウィンドウを閉じる系アクションは必ず `closeWindow()` を経由させる。独自のクローズ処理・個別の `useRef` ガードを新設しない。画面に影響する React state の変更は `hideWindow()` の解決後（`cleanup` オプション内）にのみ行う。 → 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md#close-window-common-design)
- モーダル・ダイアログのキー操作は**キャンセルと確定で非対称**に扱う：キャンセル（Escape）はDOM上のフォーカス位置に依存させず window レベルの共通 keydown リスナーで常に効くようにし、確定（Enter）はブラウザ標準のフォーカス経路（Tabで移動 → ボタン上のEnterで `click` 発火）に委ねて window レベルに独自のEnter分岐を設けない。 → 詳細: **`external-design/01-screen-transitions.md#modal-key-policy`**（実装パターンは [window-lifecycle.md](docs/internal-design/window-lifecycle.md#modal-keydown-window-level)）
- 「検索ビュー上のオーバーレイが1つでも開いているか」だけを見ればよい箇所（検索ボックス再フォーカス・`SearchBox` の `disabled` 判定・`handleKeyDown` の早期return）は、オーバーレイstateを個別に列挙せず `useSearch.ts` の派生値 `searchOverlayActive` を参照する。新しいオーバーレイstateを追加する場合はこの1箇所の配列へ追記するだけでよい。 → 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md#search-overlay-active-consolidation)
- 新しい "/" プレフィックスモード（pull型のデータ取得を伴うもの）を追加する場合、世代ID管理は `asyncCallIdRef` に新しいキーを割り当てるだけにし、既存キー（`"search"`/`"recent"`）を使い回さない。フォーカス回復時の再取得は `focusRegainTableRef.current` にエントリを1つ追加するだけにし、`onFocusChanged` リスナー自体やモード専用の鏡refを新設しない。 → 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md#prefix-mode-architecture)
- 「1回だけ抑止する」フラグ（`suppressNextSearchRef` のようなもの）を安易に新設しない。抑止した処理を後から再取得するタイミングが存在するかを必ず検討すること。存在しない場合、抑止は「気づかれないまま固まって見える」不具合の温床になる。 → 詳細: [window-lifecycle.md](docs/internal-design/window-lifecycle.md#suppress-next-search-ref-removed)

### 検索結果一覧の選択状態・行構造

→ 詳細: [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md)

- 選択（`selected`）は識別子（`ResultRow.key`）を持つ「意図（intent）」と現在の候補一覧から導出する値であり、書き込み可能な state ではない。「意図」と「現在の候補一覧」から導出する設計を優先し、新設する類似の値を直接 state 化しない。 → 詳細: **`external-design/02-list-and-selection.md#selection-model`**（実装は [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#selection-is-derived)）
- intent を `{type:'top'}` へリセットするのは「query/settings/closeRefreshTick の変化」という汎用トリガー1本のみに一本化する。モード固有の強制リセットeffectや、「次の1回だけ抑止する」一度きりのフラグは新設しない。reset トリガーの依存配列には"ユーザーが新しい文脈に入ったことを示す値"だけを含め、"操作の副作用として変化する値"を含めない。 → 詳細: [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#reset-triggers)
- 移動先が操作時点で確定的に分かる場合（末尾追加・D&D確定等）は intent を同期的に設定してよい。移動先が非同期でしか確定しない場合のみ、識別子照合＋タイムアウトの復元機構に乗せる。 → 詳細: [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#sync-vs-async-restore)
- 新しい行種別（★お気に入り・メモ等）の追加は `ResultRow` に `kind` を1つ足して `rows` 構築ロジック（`useSearch.ts` 内の1箇所）に組み込むだけで完結させる。個別のオフセット変数（`pinnedLength` 等）は新設しない。選択中の行種別の判定は常に `rows[selected].kind` で行う。 → 詳細: [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#adding-a-row-kind)
- Web検索行は現在 `rows` に未統合で `baseLength+1` の特例（意図的な保留）。選択のずれ・消失の不具合はまずこの特例を疑うこと。 → 詳細: [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#web-search-row-exception)
- 結果行のルート要素は `<div role="button">` のまま維持し、`<button>` に戻さない（内部に複数の操作ボタンを持つ前提の構造）。この規約は `ResultList.tsx` の行に限らず、選択可能な一覧行を描画する全コンポーネント（プレフィックスコマンド候補・Web検索行・パス貼り付けウィザードのフォルダ選択候補・クリップボード履歴一覧等）に適用する（行が実在の `<button>` だとクリック後にDOMフォーカスが残留し、モーダル確認等の window レベル `keydown` リスナーを誤って発火させる不具合の実例があった）。個別の内部操作ボタン・D&D等の事情が無い新しい一覧行は、まず共通ラッパー `SelectableRow.tsx` の利用を検討する。結果行に区切り線（`border-b`/`border-t`）は使わない。区切りが必要な場合は背景色差のみで表現する。 → 詳細: [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#dom-structure-and-dividers)

### フッター表示

→ 詳細: [status-footer.md](docs/internal-design/status-footer.md)

- フッターは「キーボードだけで何ができるかを示す領域」とする規約（正本は 00-requirements.md「フッター表示規約（全画面共通）」節）に従う。新しい画面・モードのフッターを追加・変更する場合、既存画面の現状表示内容は複製せず `docs/internal-design/status-footer.md` の実装マップを参照し、同じ表に追記する。 → 詳細: [status-footer.md](docs/internal-design/status-footer.md#footer-implementation-map)

### 設定画面の共通アーキテクチャ

→ 詳細: [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md)

- 設定パネルのタブを追加・削除・改名する場合、タブ一覧の正本（`#settings-tabs-list`）を含む全箇所（コード・00-requirements.md・CLAUDE.mdディレクトリ構成図）を同時に更新する。 → 詳細: [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md#settings-tabs-list)
- 設定画面のどの箇所にも縦ラインによる区切り（`border-l`）を使わない。階層構造は `SettingsIndent`、グループ見出しは `SettingsGroup` を使う。区切りは `gap` の広さ、または見出し＋横罫線で表現する。 → 詳細: [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md#indent-and-group)
- 新しい設定項目を追加する場合、テキスト・数値・タグ入力は `useSettingsDraft` ＋ `SettingsSaveBar` の一括保存パターンに乗せ、トグル・チェックボックス・ラジオボタンは即時保存のパターンに乗せる。どちらにも当てはまらない独自の保存 UI を新設しない。 → 詳細: [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md#save-model)
- バリデーションエラーは常にそれを表示するコンポーネント自身のローカル state として持つ。タブより上位のフック（`useSettings`/`useHotkey` 等）にエラー state を持たせない。`set_*` 系フックコールバックは「成功時 `null`、失敗時エラーメッセージ文字列」という `Promise<string | null>` の契約に統一する。 → 詳細: [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md#error-state-location)

### ファイル検索・frecency・検索フォルダ詳細設定

→ 詳細: [file-search-and-frecency.md](docs/internal-design/file-search-and-frecency.md)

- 拡張子フィルタリングを持つ設定を新設する場合、ブラックリスト用・ホワイトリスト用は必ず独立フィールドとして持たせる（共有フィールドにしない。モード切替で入力内容が意図せず流用される事故を防ぐため）。 → 詳細: [file-search-and-frecency.md](docs/internal-design/file-search-and-frecency.md#folder-detail-settings)
- frecencyスコアは `count * decay(lastUsed)`。この仕組み（decay係数・二次キー）はプレフィックスコマンド候補（`docs/internal-design/calc-and-prefix-commands.md`）でもキーを `path` から `keyword` に変えて再利用する。 → 詳細: [file-search-and-frecency.md](docs/internal-design/file-search-and-frecency.md#frecency)
- ファイル起動は `ShellExecuteW` を直接呼ぶ（`cmd /C start` はコマンドインジェクションのリスクがあるため使わない）。 → 詳細: [file-search-and-frecency.md](docs/internal-design/file-search-and-frecency.md#file-launch)
- 拡張子タグ編集 UI は `ExtensionFilterEditor.tsx` を再利用し、個別実装を増やさない。 → 詳細: [file-search-and-frecency.md](docs/internal-design/file-search-and-frecency.md#extension-filter-editor-extraction)

### ピン止め・お気に入り・メモのデータ構造

→ 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md)

- `FavoriteNode` は `parentId` を持つフラットな配列（隣接リスト）で管理する。再帰的な木構造にせず、ノードの移動は1フィールドの更新で表現する。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#favorite-node-structure)
- 予約フォルダ（ピン止め／お気に入り／メモ／メモのゴミ箱）は固定IDで参照する。Rust側の定数値を変更する場合、フロントエンド側の定数も必ず同時に更新する（型システムによる自動追従はない）。バリデーションはフロントエンドだけでなくRust側（保存直前）でも必ず行う。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#reserved-folders)
- メモ本文は`MemoDocument`としてツリーとは別に保存し、フロントエンドからstoreへ直接書き込まない。保存はRustコマンドへ一本化し、`expectedRevision`で競合を検出する。お気に入り配列と本文マップを同時に扱う場合のロック順はFavoriteNodes → MemoDocumentsに固定する。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#memo-document-persistence)
- メモ削除は通常ルートではゴミ箱への論理削除、ゴミ箱内では子孫本文を含む完全削除とする。予約ルート自身は移動・リネーム・削除・ドラッグ対象にしない。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#memo-trash-lifecycle)
- お気に入り管理とメモ管理は`nodeTree`／`useTreeEditSelection`／入力部品に加え、キー伝播・drop位置・循環移動・移動先計算を`treeEditUtils`で共有する。固定行モデルと更新契約が異なるため、行描画・D&Dイベント・更新コマンドは専用実装を保ち、共有層へ機能固有条件を持ち込まない。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#memo-edit-tree-boundary)
- 可視性判定（「このUI要素は表示されるか」）とバックエンドの除外・フィルタ条件は、同じブール式を1箇所にまとめて両方から参照する。片方だけ個別に再実装しない。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#search-exclusion)
- `dragDropEnabled: false` によりOSネイティブD&Dは無効化済み。HTML5 D&Dによる並び替えとOSからのファイルドロップ受け入れは現状の実装では二者択一の関係にある。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#dnd-reordering)
- `/recent` 等の一覧に新しい行アクション（★・メモ等）を追加する場合、`recentMode` を理由にした除外分岐を新設しない。表示可否を切り替える必要がある場合は既存の合成フラグ（`pinnedVisible` のような「複数モードを包含した1つの真実」）を再利用する。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#pinning-from-recent)
- ツリー構造を持つ一覧（お気に入り・メモ等）で「順序がおかしい」「意図した項目と違うものが選ばれる」報告を受けた場合、まずアルゴリズム（平坦化・ソート）自体を疑う前に、同名・同一表示内容のノードが複数存在してユーザーが取り違えていないかを確認する。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#duplicate-folder-name-validation)
- `/favorite` モードに前倒し実装していた上下移動ボタン・フォルダ削除アイコンは、お気に入り管理画面の完成時に撤去済みである。一覧閲覧とツリー管理の責務を再び混在させない。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#favorite-mode-provisional-features)
- 複数の予約ルートを1つのコマンドで扱う場合、単一ルートへの所属を先に要求しない。許可するルート集合への所属を検証してから、所属ルート別の処理を選ぶ。 → 詳細: [favorites-data-model.md](docs/internal-design/favorites-data-model.md#multi-root-command-validation)

### ピン止め・お気に入りアイコンとツールチップ

→ 詳細: [favorites-ui-iconography.md](docs/internal-design/favorites-ui-iconography.md)

- 一覧の全項目が登録済みであることが自明な文脈（ピン止めブロック・`/favorite` 一覧）では、★・ピンアイコンは選択中（selected）のときのみ表示する。 → 詳細: [favorites-ui-iconography.md](docs/internal-design/favorites-ui-iconography.md#toggle-icon-visibility)
- トグルアイコンの状態（登録済み/未登録）は色ではなく形状（輪郭／塗りつぶし）で表現する。色は行の文字色（`currentColor`）に追従させるだけにする。単色シルエットは二色構成よりサイズを一段下げることを検討する。 → 詳細: [favorites-ui-iconography.md](docs/internal-design/favorites-ui-iconography.md#toggle-icon-shape-and-color)
- アイコンは単色を一律適用せず、行が取りうる3状態（通常／選択中／グレーアウト）ごとに個別にコントラストを検証する。「視覚的に目立たせたい要素」と「控えめにしたい要素」が同じ行に混在する場合、`opacity` は控えめにしたい要素側だけに付与する。 → 詳細: [favorites-ui-iconography.md](docs/internal-design/favorites-ui-iconography.md#warning-icon)
- 新しい操作アイコンにツールチップを付ける場合は必ず `Tooltip` 共通コンポーネントを使い、`title` 属性を使わない（「省略テキストの全体表示」目的の場合のみ `title` 属性を許容）。 → 詳細: [favorites-ui-iconography.md](docs/internal-design/favorites-ui-iconography.md#tooltip-component)
- 新しい行末アイコン（ピン・★・件数バッジ・フォルダ作成・削除等）を追加する場合は必ず共通ラッパー `IconSlot` を使い、個々のコンポーネントが独自の `ml-2`・ホバー円・Tooltipラップを実装しない。余白はアイコン群を束ねる親要素の `gap-2` に一本化する。「サイズ・マージンの数値は揃えたのに見た目が揃わない」という報告を受けた場合、数値の再調整より先に各要素の実際のDOM構造（パディングの有無・ラッパーの層数）の違いを疑う。 → 詳細: [favorites-ui-iconography.md](docs/internal-design/favorites-ui-iconography.md#icon-slot-wrapper)

### 共有UI・デザインシステム

→ 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md)

- 新しいUIは、共有コンポーネント → 共有スタイル／semantic token → 新しい共有定義、の順で検討し、画面固有のraw値を先に追加しない。 → 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md#shared-ui-entry-point)
- 複数画面で同じ意味を持つ色・spacing・文字階層だけを`tailwind.config.js`の`ui-*` tokenへ追加し、単一画面の例外値まで網羅的にtoken化しない。 → 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md#semantic-tokens)
- お気に入り画面・メモ画面（統合後は管理画面ベースの単一画面）の固定行／フォルダ行／内容行は、`manageTreeRowClass`と`MANAGE_TREE_ROW_LABEL`を使い、片方だけraw classで上書きしない。 → 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md#manage-tree-row-variants)
- インラインリネームのEnter／Escは共有`RenameInput`内で完結させる。IME変換中のEnterも伝播は止め、window capture側の除外はReact stateではなく実際の入力DOMを判定する。 → 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md#memo-inline-rename)
- 作業を確定する主要ボタンと、それに並ぶ低優先度の補助ボタンは`ActionButton`のsemantic variantを使い、配置密度と固定heightの違いはsizeで表す。画面側で独自のheight・padding・outlineを追加しない。 → 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md#action-button)
- 本文textareaは挙動を無理に共通化せず、`EDITOR_SURFACE_CLASS`で表面だけを共有する。 → 詳細: [shared-ui-system.md](docs/internal-design/shared-ui-system.md#editor-surface)

### 計算機能・システムコマンド・プレフィックスコマンド候補

→ 詳細: [calc-and-prefix-commands.md](docs/internal-design/calc-and-prefix-commands.md)

- 計算結果はファイル検索結果と排他にせず、先頭の別枠固定表示領域で共存させる。将来 `isCalcExpression`/`isUrlLikeInput` の判定条件が緩んだ場合に備え、計算結果→URL変換結果の表示順序をルールとして維持する。 → 詳細: [calc-and-prefix-commands.md](docs/internal-design/calc-and-prefix-commands.md#calc-feature)
- 呼び出しキーワードの重複チェックは必ず `validate_unique_keyword` を経由させる。新しいキーワードフィールドを追加した場合は、この関数のチェック対象リストに追加する。 → 詳細: [calc-and-prefix-commands.md](docs/internal-design/calc-and-prefix-commands.md#system-command-feature)
- 新しい "/" プレフィックス機能を追加する場合、`buildPrefixCommandCandidates` に候補生成ロジックを追加するだけで既存の表示・選択・frecencyの仕組みにそのまま乗せられる。個別の候補表示 UI を新設しない。 → 詳細: [calc-and-prefix-commands.md](docs/internal-design/calc-and-prefix-commands.md#prefix-command-candidates)

### クリップボード履歴・OCR

→ 詳細: [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md)

- クリップボード画像を扱う処理は画像本体を JS 側へ渡さず Rust 側で完結させる（IPC 越しの重量データ転送を避ける）。 → 詳細: [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#clipboard-history)
- `clipboardPaneWidthRef`（mouseup用）と `clipboardPaneWidth` state（props用）は必ず同時に更新する。ref のみ更新すると、パネル再マウント時に古い幅が渡されるバグになる。 → 詳細: [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#clipboard-history)
- 左右ペインは共有`ResizableSplitPane`を使い、分割線の見た目・pointer操作・幅制約・親リサイズ追従を画面側で再実装しない。各画面は内容と幅の永続化要否だけを持つ。 → 詳細: [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#resizable-split-pane)
- OCR前処理（拡大・グレースケール化・コントラスト補正）による精度改善は検証済みで却下・見送り確定。同じアプローチを再検証しない。改善が必要な場合はWindows OCRエンジン自体の限界を前提に別モデルの導入を検討する。 → 詳細: [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#ocr-preprocessing-rejected)
- ウィンドウを閉じる新しい演出（フェードアウト等）を追加する場合、`closeWindow()` の「隠れるまで state を変更しない」原則の例外にするかどうかを明確に判断し、例外にする場合は理由を明記する。 → 詳細: [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#ocr-feature)

### 最近使ったファイル一覧

→ 詳細: [recent-files.md](docs/internal-design/recent-files.md)

- `/recent` はフォーカス復帰のたびに再取得する（プッシュ通知を持たないため、モード遷移時の1回きりの取得だと非表示中の変化が反映されない）。 → 詳細: [recent-files.md](docs/internal-design/recent-files.md#recent-mode-and-fetch)
- OneDriveのURL→ローカルパス変換ロジックに手を入れる場合、`FullRemotePath`/`UrlNamespace` の使い分けとパーセントエンコーディングの正規化の両方を必ず踏まえる。個人OneDriveのテストだけではTeamsサイト・SharePoint固有の不具合を再現できない。 → 詳細: [recent-files.md](docs/internal-design/recent-files.md#onedrive-double-folder-bug)
- 「軽い判定→重い処理」の順で処理できる項目（`.url`の表示対象設定等）は、軽い判定を先に行って対象外を早期リターンする最適化を検討する。 → 詳細: [recent-files.md](docs/internal-design/recent-files.md#url-filter-order-optimization)

### パス貼り付けによる検索フォルダ管理

→ 詳細: [path-paste.md](docs/internal-design/path-paste.md)

- OSのクリップボードから実ファイルパス（CF_HDROP）を読む必要が生じた場合、WebView2の `clipboardData` 経由では取得できないことを前提に、Rust側で直接クリップボードを読み直す設計にする。 → 詳細: [path-paste.md](docs/internal-design/path-paste.md#paste-detection)
- パス貼り付け候補に新しい操作を追加する場合は、通常モードの `ResultRow` に行種別として統合し、独立した選択state・オフセット計算・別のアイコンアセットを新設しない。候補の状態アイコンは既存の `PinIcon`／`FavoriteIcon` 等を再利用し、輪郭／塗りつぶしで状態を表す。 → 詳細: [path-paste.md](docs/internal-design/path-paste.md#paste-action-rows)
- パス貼り付け候補で1操作を確定する経路は、`closeWindow()` の `cleanup` 内で非同期書き込みを開始する。候補表示とは別ドメインの `pathPasteWizardMode` は、表示中に非同期一覧差し替えを行わない限り生インデックス選択を維持する。 → 詳細: [path-paste.md](docs/internal-design/path-paste.md#paste-action-close-order)
- 複数ステップのウィザード形式インタラクションを追加する場合、キー操作は window レベルのリスナーに一本化し、個別ステップのローカル `onKeyDown` を併存させない（二重ハンドラによるリグレッションの再発を防ぐため）。 → 詳細: [path-paste.md](docs/internal-design/path-paste.md#wizard-keydown-unification-history)
- Windowsのファイルシステム／シェル関連の機能でサードパーティクレートに不具合が疑われた場合、まず本プロジェクトが一貫して採る「Windows標準API直接呼び出し」への切り替えを検討する。 → 詳細: [path-paste.md](docs/internal-design/path-paste.md#mslnk-to-shell-link-history)

### システムトレイ・自動起動・自動アップデート

→ 詳細: [tray-autostart-updater.md](docs/internal-design/tray-autostart-updater.md)

- トレイメニューに新しい項目を追加する場合、既存の並び順（Show → Check for Updates → Start with Windows → Restart → Quit）を踏まえた位置に追加する。 → 詳細: [tray-autostart-updater.md](docs/internal-design/tray-autostart-updater.md#system-tray)
- アップデートダイアログの新しい状態を追加する場合、`SystemCommandModal` と同じオーバーレイ＋カードのデザインパターンを踏襲する。`download_and_install_update` はダウンロード完了後にプロセスが終了し制御が戻らない前提を維持する。 → 詳細: [tray-autostart-updater.md](docs/internal-design/tray-autostart-updater.md#auto-update)

### 依存ライブラリ・プラグインの選定理由

→ 詳細: [dependencies.md](docs/internal-design/dependencies.md)

- 新しいダイアログ・ポップアップ的なUIをTauriプラグインで実装する場合、`alwaysOnTop: true` のメインウィンドウとの重なりが問題にならないか必ず確認する。フロントエンドのJS APIに親ウィンドウ指定の手段がない場合はRust側のTauriコマンドとして実装し直す。 → 詳細: [dependencies.md](docs/internal-design/dependencies.md#dialog-plugin-parent-window)
- Windows固有の機能を実装する際は、まずWindows標準API（Win32／WinRT／COM）で直接実装できないかを検討し、サードパーティクレートは標準APIでの実装が著しく煩雑になる場合の代替手段として扱う。 → 詳細: [dependencies.md](docs/internal-design/dependencies.md#windows-api-first-policy)
- 依存の更新保留（`glib` 等）は、保留理由（上流の制約）を明記したまま残す。理由を書かずに「保留中」とだけ記録しない。 → 詳細: [dependencies.md](docs/internal-design/dependencies.md#dependency-update-status)

## Tauri コマンド

| コマンド | 説明 |
| --- | --- |
| `search_files(query)` | 有効な検索フォルダ内でファイル検索結果（Windows シェルアイコンの Base64 付き）を返す |
| `launch_file(path)` | ファイルを起動する |
| `open_containing_folder(path)` | 指定パスの格納フォルダ（親フォルダ）をエクスプローラーで開く（Shift+Enter）。`path` が `.lnk` の場合はリンク先実ファイルの親フォルダを開く（解決失敗時は `.lnk` 自身の親フォルダにフォールバック） |
| `calculate(expr)` | 数式を評価し結果の文字列を返す（評価不能なら `null`） |
| `copy_to_clipboard(text)` | テキストをクリップボードへコピーする |
| `get_folders()` | 登録済み検索フォルダ一覧を返す |
| `pick_folder()` | フォルダ選択ダイアログを開き、選択パスを返す。呼び出し元の `WebviewWindow` を `set_parent` で親に指定し、WinLauncher ウィンドウの背後に回らないようにしている |
| `add_folder(path)` | 検索フォルダを追加する |
| `remove_folder(path)` | 検索フォルダを削除する |
| `toggle_folder(path)` | 検索フォルダの有効/無効を切り替える |
| `set_folder_settings(path, maxDepth, includeFolders, extensionFilterMode, blacklistExtensions, whitelistExtensions)` | 指定した検索フォルダの詳細設定（検索階層数・フォルダ自体の検索対象可否・拡張子フィルタリング）をまとめて保存する。`maxDepth` が1〜20の範囲外の場合はエラーを返し保存しない。ブラックリスト・ホワイトリストの拡張子タグはそれぞれ独立にトリム・先頭 `.` 除去・小文字化・重複除去のうえで保存する |
| `execute_system_command(action)` | システムコマンド（`shutdown` / `restart` / `sleep`）を実行する |
| `get_app_settings()` | ホットキー・各機能 ON/OFF（`AppSettings`）を返す |
| `set_file_search_enabled(enabled)` | ファイル検索機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_calc_enabled(enabled)` | 数式計算機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_copy_with_comma(enabled)` | 計算結果コピー時のカンマ区切り ON/OFF を切り替えて `AppSettings` を返す |
| `set_system_command_enabled(enabled)` | システムコマンド機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_system_command_keyword(command, keyword)` | `command`（`shutdown`/`restart`/`sleep`）に対応する呼び出しキーワードを変更して `AppSettings` を返す。空文字列、または他の5キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `set_web_search_enabled(enabled)` | Web検索機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_clipboard_enabled(enabled)` | クリップボード履歴機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_clipboard_prefix(prefix)` | クリップボード履歴の呼び出しキーワード（`/` に続く部分）を変更して `AppSettings` を返す。空文字列、または他の5キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `set_clipboard_max_items(maxItems)` | クリップボード履歴の最大保持件数を変更して `AppSettings` を返す。`1` 未満はエラーを返して保存しない |
| `paste_clipboard_image(id)` | `ClipboardImageCache` から `id` に対応する画像バイナリを取得し、Win32 API でクリップボードへ直接書き込む |
| `set_recent_files_enabled(enabled)` | 最近使ったファイル一覧機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_recent_keyword(keyword)` | 最近使ったファイル一覧の呼び出しキーワード（`/` に続く部分）を変更して `AppSettings` を返す。空文字列、または他の5キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `set_recent_display_settings(includeFolders, extensionFilterMode, blacklistExtensions, whitelistExtensions)` | `/recent` の「表示対象設定」（フォルダを対象に含めるか・拡張子フィルタリング）をまとめて保存して `AppSettings` を返す。`FolderEntry` とは独立した /recent 機能全体のグローバル設定。拡張子タグの正規化は `set_folder_settings` と同じ `normalize_extensions` を使う（詳細は [recent-files.md](docs/internal-design/recent-files.md#recent-display-settings) を参照） |
| `get_recent_files()` | Windows の Recent フォルダ・Office の Recent フォルダから最近使ったファイル一覧（`.lnk`/`.url` 由来、OneDrive パス解決込み）を最終アクセス日時降順で返す（最大50件）。「表示対象設定」（フォルダを対象に含めるか・拡張子フィルタリング）を反映する（詳細は [recent-files.md](docs/internal-design/recent-files.md#recent-display-settings) を参照） |
| `get_favorites()` | 予約フォルダ（ピン止め／お気に入り／メモ）を含む `FavoriteNode` 配列全体を返す |
| `set_favorites(favorites)` | `FavoriteNode` 配列全体を置き換えて保存する。ピン止めの追加・解除・並び替えはいずれもこの1コマンドへの配列全量置換で行う。予約フォルダ（ピン止め／お気に入り／メモ）は送信内容に関わらずRust側で固定ID・固定名・folder型・ルート直下の状態へ強制的に是正してから保存する |
| `get_pinned_files()` | 「ピン止め」予約フォルダ直下の `file` 型ノードを `order` 順に、シェルアイコン付きの `FileEntry` へ変換して返す。件数上限は設けない |
| `check_paths_exist(paths)` | 渡されたパス配列と同じ順序・同じ長さで、各パスが実在するかどうかの真偽値配列を返す。ピン止めブロックの実体確認用 |
| `set_pin_enabled(enabled)` | ピン止め機能の ON/OFF を切り替えて `AppSettings` を返す |
| `is_favorited(path)` | 指定したパス文字列が「お気に入り」ツリー配下に既に登録済みかどうかを、パス文字列の完全一致で判定して返す |
| `get_favorite_nodes()` | 「お気に入り」予約フォルダ配下のノード（`folder`型・`file`型の両方。予約フォルダ自体は含まない）を `order` 順のフラット配列で返す。ツリー構造は呼び出し側が `parentId` を辿って再構築する |
| `add_favorite(path, name, folderId)` | 指定したパス・表示名で `file` 型ノードを `folderId` 配下に1件追加する。同一パス文字列が「お気に入り」ツリー配下に既に登録済みの場合は何もせず現在の配列をそのまま返す |
| `add_favorite_folder(name, parentId)` | `parentId` 配下に `folder` 型ノードを1件追加する。空文字列、または同一親配下に同名フォルダが既に存在する場合はエラーを返して保存しない |
| `rename_favorite_node(id, newName)` | 指定ノード（フォルダ・アイテムいずれも可）の `name` を変更する。空文字列、または同一親・同一種別内に同名ノードが既に存在する場合はエラーを返して保存しない。予約フォルダ（ピン止め／お気に入り／メモ）はリネームできない |
| `set_favorite_folder_collapsed(id, collapsed)` | 指定ノードの開閉状態（`collapsed`）を設定する。`/favorite` ブラウジングとお気に入り編集ビューで共有される |
| `remove_favorite(id)` | 指定ノードIDのエントリを1件削除する（子孫を持つ `folder` 型ノードのカスケード削除は非対応） |
| `remove_favorite_folder(id)` | 指定フォルダノード自身と、その配下（再帰）を丸ごと削除する。実ファイル自体は操作しない。予約フォルダ（ピン止め／お気に入り／メモ）は削除できない |
| `move_favorite_node_to(id, newParentId, targetIndex)` | 指定ノードを `newParentId` 配下の `targetIndex` の位置へ移動する（並び替え・再親化を同一ロジックで扱う）。予約フォルダ自体は移動できず、移動先は「お気に入り」ツリー配下の `folder` 型ノードに限られ、循環参照・同名重複が生じる場合はエラーを返して保存しない |
| `set_favorite_enabled(enabled)` | お気に入り機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_favorite_keyword(keyword)` | お気に入り一覧（`/favorite`）の呼び出しキーワードを変更して `AppSettings` を返す。空文字列、または他の5キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `set_hotkey(accelerator)` | 起動ホットキーを変更（unregister → register）し `AppSettings` を返す。失敗時は旧ホットキーを維持しエラーを返す |
| `ocr_from_clipboard()` | クリップボードの画像を Rust 側で直接読み取り、Windows OCR API（`Windows.Media.Ocr`）でテキスト抽出して返す。日本語言語パック優先・英語フォールバック。`tauri::async_runtime::spawn_blocking` で別スレッドに逃がし COM を初期化して実行。テキスト取得は `OcrLine.Words` を個別に取得し、直前と現在の単語が両方とも ASCII 英数字のみ（各文字が `is_ascii_alphanumeric()` を満たすか `chars().all(...)` で判定）の場合のみスペースを挿入、それ以外はスペースなしで結合（CJK 文字への不要な空白挿入を防ぐ）。行のソートは先頭ワードの `BoundingRect.Y`（`Windows.Foundation.Rect`、`"Foundation"` feature 必要）を基準に昇順ソートしてから改行結合する |
| `set_ocr_enabled(enabled)` | OCR機能の ON/OFF を切り替えて `AppSettings` を返す |
| `check_for_update()` | GitHub Releases（`latest.json`）に対してアップデートの有無を確認し、`{ available, version, notes }` を返す。見つかった更新は次の `download_and_install_update` 呼び出しに備えて Rust 側に保持する |
| `download_and_install_update()` | 保持しておいた更新をダウンロード＆インストールする。成功時は内部でアプリを終了するため呼び出し元に制御は戻らない |
| `set_check_update_on_startup(enabled)` | 起動時アップデートチェックの ON/OFF を切り替えて `AppSettings` を返す |
| `set_path_paste_enabled(enabled)` | パス貼り付けによる検索フォルダ管理の ON/OFF を切り替えて `AppSettings` を返す |
| `read_pasted_hdrop_path()` | 検索ボックスへの貼り付けイベント発生時に呼ぶ。クリップボードの `CF_HDROP` を直接読み、パスが単一の場合はその文字列（実在確認・フォルダ/ファイル判定は行わない）を返す。複数パス・`CF_HDROP` なしの場合は `null` |
| `judge_pasted_path(text)` | 検索ボックスの文字列（貼り付け・手入力を問わない）に対し、前後のダブルクォートを取り除いたうえで実在確認・フォルダ/ファイル判定を行い、`{ path, name, isDir }` を返す（実在しない場合は `null`） |
| `add_search_folder_from_paste(path)` | 機能1：検索フォルダとして追加する。既に登録済みの場合は追加をスキップし、いずれもトースト通知で結果を伝える |
| `create_shortcut(targetPath, folderPath, name)` | 機能2：`folderPath` 配下に `targetPath` を指す `.lnk` を作成する（`windows-rs` 経由の `IShellLinkW`/`IPersistFile` 直接呼び出し）。同名が既に存在する場合は連番を付与し、成功時にトースト通知を表示する |

## フロントエンド

- `App.tsx` はルートのコンポジションのみを担う（検索/計算 UI・設定パネル・お気に入り管理・メモ管理の4ビュー（`MainView`）の切替、`storeRef`／`inputRef` の保持、フック間をつなぐ `handleKeyDown`・`closeSettings` 等の組み立て）。機能ごとのロジックはカスタムフックへ、UI は `components/` 配下の個別コンポーネントへ分離している
- カスタムフック（`hooks/`）
  - `useSettings(showSettings)`：`AppSettings`・検索フォルダの読み込みと各 `set_*` コマンドの呼び出し（ホットキーを除く）
  - `useHotkey(setAppSettings)`：`set_hotkey` の呼び出しとエラー状態。`useSettings` の `setAppSettings` を受け取って更新を反映する
  - `useSearch(appSettings, settingsVersion, storeRef)`：検索クエリ・計算/プレフィックスコマンド候補判定・ファイル検索・frecency（ファイル起動用・プレフィックスコマンド用の両方）・ファイル起動／コピー／Web検索を一括管理する。クリップボードモード・最近使ったファイル一覧モードの判定もここで行う。パス貼り付けによる検索フォルダ管理（機能1〜4のアクション一式）もここで管理する。`closeWindow` を内部で直接使うアクションを持つため、`useClipboard` のように別フックへ切り出さず `useSearch.ts` 自身に実装している
    - 検索一覧で選択操作を「キーボード操作」と「マウスホバー」に分離しているロジック（ホバー抑制）は [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#hover-suppression) を参照
    - 非同期呼び出しの世代 ID 管理とフォーカス回復時の再取得は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#prefix-mode-architecture) を、ウィンドウを閉じる処理は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#close-window-common-design) を参照。新しい "/" プレフィックスモード・ウィンドウを閉じるアクションを追加する際はそれぞれのポインタ先の規約に従うこと
    - ファイル起動やコピー等でウィンドウを閉じる直前の空クエリへの変化でも `search_files("")` を抑止しない設計の経緯は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#suppress-next-search-ref-removed) を参照
  - `useTreeEditSelection(tree, resetKey, resetWhen)`：お気に入り管理画面・メモ画面・メモ管理画面の選択intentを共有管理する。管理画面ツリーのキーボード／ホバー入口分離とホバー抑制も [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#hover-suppression) を参照
  - `useClipboard(appSettingsRef, clipboardMode, clipboardFilterText, storeRef, closeWindow)`：クリップボード履歴の記録・永続化・フィルタ済み一覧・書き戻し。ウィンドウを閉じる処理は `useSearch` の `closeWindow` をそのまま受け取って使う
  - `useUpdater()`：アップデートダイアログの状態管理、`check_for_update`/`download_and_install_update` の呼び出し、トレイ発の `"check-for-update-requested"` イベントの受信（詳細は [tray-autostart-updater.md](docs/internal-design/tray-autostart-updater.md#auto-update) を参照）
  - フック間で共有する `Store` インスタンス（`storeRef`）は `App.tsx` が一度だけ読み込み、`useSearch`／`useClipboard` には参照を渡すのみ
- コンポーネント（`components/`）は表示と props 経由のイベント通知のみを担い、Tauri コマンドや永続化には直接アクセスしない（すべて `App.tsx` がフックの戻り値を props として渡す）
- 検索/計算 UI のキーボード操作：↑↓ 選択、Enter で起動 or コピー、Shift+Enter で選択中のファイル（通常のファイル検索結果／`/recent` のみ対象）の格納フォルダを開く、Esc で非表示、`Ctrl+,` で設定パネルを開く、`Ctrl+D` でクエリを全クリア
- `Ctrl+D`：同じ `window` の `keydown`イベントリスナーで一括処理する。OCRプレビュー表示中は「閉じる」ボタンと同じハンドラを呼び出し、それ以外では`search.setQuery("")`に加え、表示中の管理画面が`localQueryClearHandlerRef`へ登録した可視の絞り込み文字列もクリアする（詳細は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#local-query-clear-dispatch)）
- クリップボード履歴モードのときのみ、検索結果リストの右側に詳細パネルを表示する2カラムレイアウトになる（詳細は [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#clipboard-history) を参照）
- OCR プレビュー表示中（`ocrLoading || ocrText !== null || ocrError !== null`）は検索結果エリア（`ResultList` / `ClipboardPanel`）と `StatusFooter` を非表示にする。検索ロジック自体は動作し続け、クエリや内部 state には影響しない。閉じる／コピーして閉じるの挙動詳細は [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#ocr-feature) を参照
- 設定パネル：タブ構成。カテゴリ一覧は [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md#settings-tabs-list) を参照。Escで検索 UI に戻る（表示中の`Ctrl+,`は無効）
- `@tauri-apps/api/core` の `invoke` で Rust コマンドを呼ぶ
- `@tauri-apps/api/event` の `listen` で Rust 側からの `clipboard-changed` / `check-for-update-requested` イベントを受信する
- `getCurrentWindow().onFocusChanged` でフォーカスアウト検知・自動非表示、フォーカスイン時の再フォーカス（詳細は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#focus-out-auto-hide) を参照）

## コマンド実行時の注意

- 作業ディレクトリは既にプロジェクトルートに設定されているため、`cd` で移動する必要は原則ない。`git` コマンドを含め、`cd` を挟んだ複合コマンドは避け、単体のコマンドとしてそのまま実行すること

## ビルド

```bash
# Rust のみコンパイル確認
cargo build --manifest-path src-tauri/Cargo.toml

# 開発サーバー起動（フロント + Rust）
npm run tauri dev

# プロダクションビルド
npm run tauri build
```

- `npm run tauri build`（内部で `beforeBuildCommand` として `npm run build`＝`tsc && vite build` が実行される）では、`vite.config.ts` が Vite の `command === "build"` を検知して Terser minify に切り替わり、`console.debug` / `console.log` の呼び出しを自動削除する（詳細は「ログ出力方針」節を参照）。`npm run tauri dev`（Vite の `command` は `"serve"`）ではこの設定が適用されず、通常の esbuild minify のままログもそのまま残る

## テスト方針

- 新しい画面・操作を完了とする前に、同種の既存画面を選択状態、ヘッダー、行アクション、フッター、ドラッグ&ドロップ、入力フォーカスの観点で構造比較する。差分が仕様上必要かを確認し、意図しない独自実装を残さない。

- ビルド確認は `cargo build` で行う
- 動作確認は `npm run tauri dev` で起動して目視確認する
- `npm run tauri dev` 起動後の PowerShell + スクリーンキャプチャによる自動 GUI テストは実施しない

## リリース手順

詳細な手順（バージョン bump → 署名付きビルド → `latest.json` 生成 → リリースノート更新 → git commit/tag/push → `gh release create` → アセットアップロード、およびリリース後の動作確認チェックリスト）は [docs/process/ad_app_600_release.md](docs/process/ad_app_600_release.md) を参照。600_リリース工程（詳細は `WORKFLOW.md` を参照）として、MG からの実行指示を受けて着手する。

## WinGetパッケージの新バージョン申請手順

既存パッケージ（`hidecode365.WinLauncher`）へのバージョン追加（update申請）の手順。初回の新規パッケージ申請（new）とは別の手順。

1. `gh release view <tag> --repo hidecode365/win-launcher --json assets` でリリースアセット一覧を取得し、インストーラー（`.exe`）のダウンロード URL を確認する（`.sig`・`latest.json`・`.msi` は申請に使わない。既存マニフェストが `.exe`（nullsoft）のみ登録のため、`.msi` を追加すると `wingetcreate update` がインストーラー URL 数の不一致でエラーになる。既存マニフェストのインストーラー種別・数は `winget show hidecode365.WinLauncher` で事前に確認できる）
2. `wingetcreate update hidecode365.WinLauncher --version <バージョン> --urls <exeのURL>` を（`--submit` なしで）実行し、ローカルにマニフェスト（`manifests/h/hidecode365/WinLauncher/<バージョン>/` 配下に3ファイル）を生成する
3. 生成された `*.locale.en-US.yaml` の `Documentations`（Wiki リンク）を削除する。このリポジトリに Wiki ページが存在せずリンク切れになるため
4. 内容を確認したうえで `wingetcreate submit "manifests/h/hidecode365/WinLauncher/<バージョン>"` でPRを提出する（ローカルで編集済みのマニフェストをそのまま送るため、`update --submit` で再実行しない）
5. `--submit`／`submit` 実行時、GitHub認証（デバイスコード）を求められる場合がある（過去の認証がキャッシュされていれば省略されることもある）。求められた場合は表示されたコードとURLをユーザーに案内し、ブラウザでの認証完了を待つ
6. 提出後に表示されるPR URL（`https://github.com/microsoft/winget-pkgs/pull/<番号>`）をユーザーに報告する
7. `wingetcreate` はカレントディレクトリ（このリポジトリのルート）配下に `manifests/h/hidecode365/WinLauncher/<バージョン>/` を生成する。過去の初回申請（v0.1.0）分はこのリポジトリに `git add` 済みでコミット履歴に残っているため、後始末で削除する際は **新しく生成した対象バージョンのフォルダのみ**を指定して削除すること（`manifests/` ディレクトリ全体を `rm -rf` すると、コミット済みの過去バージョン分まで巻き込んで削除してしまう）。削除前に `git status` で意図した範囲だけが untracked になっているか必ず確認する

## リリースダウンロード数の確認

`tools/check-download-stats.ps1` は GitHub Releases の各バージョンについて `.exe`/`.msi` のダウンロード数を集計・表示する PowerShell スクリプト。`.sig` ファイル・`latest.json` は WinGet 審査パイプライン等のアクセスがノイズとして混入するため集計対象から除外している。
