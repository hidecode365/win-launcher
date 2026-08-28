# WinLauncher — 設計方針

## 開発フロー

工程定義表全体は `WORKFLOW.md`（MG側リポジトリ）を参照。工程別の実施要領・issue管理・バグ修正フロー・WinGet申請手順等の工程横断手順は、`winlauncher-ad` Skill（`.claude/skills/winlauncher-ad/`）にまとまっている。該当する作業を行う際は必ずこのSkillを参照すること。

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

> この構成図は主要なコンポーネントのみを示す簡略版であり、網羅性は保証しない。共通コンポーネントの詳細は本文の各節・`docs/internal-design/*.md` を参照（詳細は [ad_app_900_sync-checklist.md](.claude/skills/winlauncher-ad/references/ad_app_900_sync-checklist.md) を参照）。

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
│   └── internal-design/      # 設計判断の詳細（現状仕様・経緯・却下案・不具合の記録）。詳細は「実装パターン」節を参照
├── .claude/skills/winlauncher-ad/  # AD工程別・工程横断の実施要領。詳細は「開発フロー」節を参照
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

## 実装パターン

コード変更（デザイン調整・バグ修正・新機能実装を問わない）を行う際に参照する、画面・機能ごとの実装原則は `winlauncher-ad` Skill（`.claude/skills/winlauncher-ad/references/patterns/`）にまとまっている。15トピック（横断アーキテクチャ系5・機能単位系10）に分かれており、変更対象に対応するファイルだけを読めばよい（無関係なトピックを読む必要はない）。各原則の背景（現状仕様の詳細・経緯・却下案・不具合の記録）は各ファイルの「→ 詳細」リンク先（`docs/internal-design/*.md`）を確認する。

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
| `set_favorite_folder_collapsed(id, collapsed)` | 指定ノードの開閉状態（`collapsed`）を設定する。お気に入り編集ビュー・メモ管理画面（フォルダノード）で共有される |
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

- `App.tsx` はルートのコンポジションのみを担う（検索・設定・お気に入り管理・メモ管理・クリップボード履歴・最近使ったファイル・OCRの7ビュー（`MainView`）の切替、`storeRef`／`inputRef` の保持、フック間をつなぐ `handleKeyDown`・`closeSettings` 等の組み立て）。機能ごとのロジックはカスタムフックへ、UI は `components/` 配下の個別コンポーネントへ分離している
- カスタムフック（`hooks/`）
  - `useSettings(showSettings)`：`AppSettings`・検索フォルダの読み込みと各 `set_*` コマンドの呼び出し（ホットキーを除く）
  - `useHotkey(setAppSettings)`：`set_hotkey` の呼び出しとエラー状態。`useSettings` の `setAppSettings` を受け取って更新を反映する
  - `useSearch(appSettings, settingsVersion, storeRef, resetToSearchView)`：検索クエリ・計算/プレフィックスコマンド候補判定・ファイル検索・frecency（ファイル起動用・プレフィックスコマンド用の両方）・ファイル起動／コピー／Web検索を一括管理する。クリップボード履歴・最近使ったファイルのL1画面への昇格判定（`clipboardMode`/`recentMode`）とローカル絞り込みstate（`clipboardEditFilterText`/`recentEditFilterText`）もここで持つ（詳細は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#prefix-mode-l1-promotion) を参照）。パス貼り付けによる検索フォルダ管理（機能1〜4のアクション一式）もここで管理する。`closeWindow` を内部で直接使うアクションを持つため、`useClipboard` のように別フックへ切り出さず `useSearch.ts` 自身に実装している
    - 検索一覧で選択操作を「キーボード操作」と「マウスホバー」に分離しているロジック（ホバー抑制）は [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#hover-suppression) を参照
    - 非同期呼び出しの世代 ID 管理とフォーカス回復時の再取得は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#prefix-mode-architecture) を、ウィンドウを閉じる処理は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#close-window-common-design) を参照。新しい "/" プレフィックスモード・ウィンドウを閉じるアクションを追加する際はそれぞれのポインタ先の規約に従うこと
    - ファイル起動やコピー等でウィンドウを閉じる直前の空クエリへの変化でも `search_files("")` を抑止しない設計の経緯は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#suppress-next-search-ref-removed) を参照
  - `useTreeEditSelection(tree, resetKey, resetWhen)`：お気に入り編集ビュー（`useFavoriteEditSelection.ts` 経由）・メモ管理画面（`useMemoManage.ts` 経由）の選択intentを共有管理する。管理画面ツリーのキーボード／ホバー入口分離とホバー抑制も [result-list-and-selection.md](docs/internal-design/result-list-and-selection.md#hover-suppression) を参照
  - `useClipboard(appSettingsRef, clipboardMode, clipboardFilterText, storeRef, closeWindow, syncClipboardSelectionItems, resetToSearchView)`：クリップボード履歴の記録・永続化・フィルタ済み一覧・書き戻し。ウィンドウを閉じる処理は `useSearch` の `closeWindow` をそのまま受け取って使う
  - `useOcr()`：OCR画面の状態（ローディング・結果テキスト・エラー・画像URL）管理と`ocr_from_clipboard`の呼び出し
  - `useUpdater()`：アップデートダイアログの状態管理、`check_for_update`/`download_and_install_update` の呼び出し、トレイ発の `"check-for-update-requested"` イベントの受信（詳細は [tray-autostart-updater.md](docs/internal-design/tray-autostart-updater.md#auto-update) を参照）
  - フック間で共有する `Store` インスタンス（`storeRef`）は `App.tsx` が一度だけ読み込み、`useSearch`／`useClipboard` には参照を渡すのみ
- コンポーネント（`components/`）は表示と props 経由のイベント通知のみを担い、Tauri コマンドや永続化には直接アクセスしない（すべて `App.tsx` がフックの戻り値を props として渡す）
- 検索/計算 UI のキーボード操作：↑↓ 選択、Enter で起動 or コピー、Shift+Enter で選択中のファイル（ピン止め・通常のファイル検索結果選択時）の格納フォルダを開く、Esc で非表示、`Ctrl+,` で設定パネルを開く、`Ctrl+D` でクエリを全クリア
- `Ctrl+D`：同じ `window` の `keydown`イベントリスナーで一括処理する。**OCR画面ではCtrl+Dを完全に無効化し、検索クエリ・OCR本文とも一切変更しない**。クリップボード履歴・最近使ったファイル画面ではローカル絞り込みのみをクリアし、L1滞在中に凍結して維持している検索クエリ自体は変更しない（変更すると`clipboardMode`/`recentMode`の判定が崩れるため）。それ以外の画面では`search.setQuery("")`に加え、表示中の管理画面が`localQueryClearHandlerRef`へ登録した可視の絞り込み文字列もクリアする（詳細は [window-lifecycle.md](docs/internal-design/window-lifecycle.md#local-query-clear-dispatch)）
- クリップボード履歴・最近使ったファイル・OCRは検索画面の子状態ではなく、お気に入り・メモと同格のL1画面（`ClipboardEditView.tsx`／`RecentEditView.tsx`／`OcrEditView.tsx`）として独立している。クリップボード履歴画面は常に左リスト・右の読み取り専用プレビューの2カラムレイアウト（詳細は [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#clipboard-history) を参照）。OCR画面は左に画像・右に編集可能な結果テキストの2ペインで、閉じる／コピーして閉じるはいずれも共通クローズ経路を使う（詳細は [clipboard-and-ocr.md](docs/internal-design/clipboard-and-ocr.md#ocr-feature) を参照）
- 設定パネル：タブ構成。カテゴリ一覧は [settings-panel-architecture.md](docs/internal-design/settings-panel-architecture.md#settings-tabs-list) を参照。設定を開くボタンは各L1画面のヘッダーに共通コンポーネント`SettingsButton`として配置する（詳細は [shared-ui-system.md](docs/internal-design/shared-ui-system.md#settings-button) を参照）。Escで開いた元のL1画面に戻る（表示中の`Ctrl+,`は無効）
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

## リリース・WinGet申請

リリース実行・WinGet申請手順は `winlauncher-ad` Skill（`.claude/skills/winlauncher-ad/references/process/ad_app_600_release.md`・`references/ad_app_900_winget-application.md`）を参照。
