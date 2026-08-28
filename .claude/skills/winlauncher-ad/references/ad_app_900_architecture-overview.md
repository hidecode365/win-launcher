# アーキテクチャ・技術スタック・Tauriプラグイン

> この構成図は主要なコンポーネントのみを示す簡略版であり、網羅性は保証しない。共通コンポーネントの詳細は本文の各節・`docs/internal-design/*.md` を参照（詳細は [ad_app_900_sync-checklist.md](ad_app_900_sync-checklist.md) を参照）。

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

依存バージョンの更新状況・保留理由は [dependencies.md](../../../../docs/internal-design/dependencies.md#dependency-update-status) を参照。

## Tauri プラグイン

| プラグイン | 用途 |
| --- | --- |
| `tauri-plugin-global-shortcut` | グローバルホットキー（起動ホットキー） |
| `tauri-plugin-shell` | ファイル起動・Web検索の URL をデフォルトブラウザで開く（`open()`） |
| `tauri-plugin-autostart` | Windows スタートアップ登録 |
| `tauri-plugin-store` | 検索フォルダ・各機能 ON/OFF・ホットキー設定・ウィンドウサイズ・ファイル起動の frecency 履歴の永続化（`settings.json`）。frecency 履歴・ウィンドウサイズは Rust コマンドを介さず、フロントエンドが JS パッケージ `@tauri-apps/plugin-store` で直接読み書きする |
| `tauri-plugin-dialog` | フォルダ選択ダイアログ。**必ず Rust 側の Tauri コマンド（`pick_folder`）として実装し、`set_parent` で親ウィンドウを指定すること**（理由は [dependencies.md](../../../../docs/internal-design/dependencies.md#dialog-plugin-parent-window) を参照） |
| `tauri-plugin-clipboard-manager` | 計算結果のクリップボードコピー（Rust コマンド経由）。クリップボード履歴機能ではフロントエンドが JS パッケージ `@tauri-apps/plugin-clipboard-manager` で直接 `readText`/`readImage`/`writeImage` を呼ぶ |
| `tauri-plugin-process` | アプリケーションの再起動（`relaunch`） |
| `tauri-plugin-updater` | 自動アップデート（GitHub Releases + `latest.json` の確認・ダウンロード・インストール） |
| `tauri-plugin-notification` | パス貼り付け候補の操作（検索フォルダ追加・ショートカット配置・ピン止め・お気に入り）完了時の Windows トースト通知 |
| `tauri` (tray-icon feature) | システムトレイ常駐 |

プラグインの選定理由の詳細は [dependencies.md](../../../../docs/internal-design/dependencies.md#plugin-list-rationale) を参照。
