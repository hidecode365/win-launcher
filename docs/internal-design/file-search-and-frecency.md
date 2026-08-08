# ファイル検索・frecencyランキング・検索フォルダ詳細設定

対象コード: `src-tauri/src/main.rs`（`search_files`／`FolderEntry`／`open_file`）、`src/hooks/useSearch.ts`（frecencyスコア計算）、`src/components/FileSearchSettings.tsx`／`FolderDetailSettingsModal.tsx`／`ExtensionFilterEditor.tsx`。

## 現在の設計

<a id="search-logic"></a>

### 検索ロジック（Rust）

- `appSettings.fileSearchEnabled` が `false` の場合、フロントエンドは `search_files` を呼ばず検索結果を表示しない
- 検索対象フォルダは設定で複数登録可能（有効/無効を個別に切替）
- 有効なフォルダのみ `walkdir` で再帰走査（シンボリックリンク追跡あり）。最大深さはフォルダごとの詳細設定（`max_depth`。デフォルト3）に従う（詳細は [folder-detail-settings](#folder-detail-settings) を参照）
- クエリを小文字変換してファイル名に部分一致
- 全フォルダ合計で最大 50 件に絞って返却
- 走査ルート自身（`WalkDir` の depth 0 エントリ、＝検索フォルダそのもの）は「フォルダ自体を検索対象に含める」設定に関わらず結果に含めない
- 各ファイルの Windows シェルアイコン（エクスプローラーと同じアイコン）を取得し、`data:image/png;base64,...` 形式の文字列として結果に含める
  - Win32 API `SHGetFileInfoW`（`SHGFI_ICON | SHGFI_SMALLICON`）でファイルパスから `HICON` を取得
  - `GetIconInfo` → `GetObjectW` でカラービットマップ（`HBITMAP`）の寸法を取得し、`GetDIBits` で 32bpp トップダウン BGRA のピクセルデータへ変換
  - BGRA → RGBA に並べ替えたうえで `image` クレートで PNG エンコードし、`base64` クレートで Base64 化
  - 取得したアイコン・ビットマップ・DC などの GDI ハンドルは RAII ガード（`Drop` 実装）で確実に解放する
  - 取得に失敗した場合（無効なパス等）はアイコンなし（`null`）として扱い、フロントエンドは汎用のドキュメントアイコン SVG にフォールバックする
- ピン止め済みファイルの除外（`exclude_paths` 引数）は [favorites-data-model.md](favorites-data-model.md) を参照

<a id="frecency"></a>

### ファイル検索結果の frecency ランキング（フロントエンド）

`search_files` が返したファイル一覧を、フロントエンド側で frecency スコアの降順に並び替えて表示する（Rust 側のソート処理は不要）。

- 履歴データは `@tauri-apps/plugin-store` の JS API（`Store.load("settings.json")`）から直接読み書きする
  - Rust 側（`tauri-plugin-store` の `app.store()`）と JS 側（`Store.load()`）は同じ `settings.json` を共有する同一のストアコレクションを参照するため、Rust 側にコマンドを追加せずフロントエンドだけで永続化が完結する
  - JS から直接ストア操作を呼べるよう、`capabilities/default.json` に `store:allow-load` / `store:allow-get` / `store:allow-set` / `store:allow-save` permission を追加している（削除・クリア等の破壊的操作は使わないため付与しない）
  - キー名は `"frecency"`、値は `{ [path: string]: { count: number, lastUsed: number } }`（`lastUsed` は UNIX タイムスタンプ ms）
- アプリ起動時（マウント時）に `frecency` を読み込み、`useState` と同期する `useRef` の両方で保持する（`useRef` は `useCallback` の古いクロージャ参照を避けるため、`useState` は再レンダリングのトリガー用）
- ファイル起動時（Enter／クリックいずれも `launchFile` 経由）に対象パスの `count` をインクリメントし `lastUsed` を現在時刻で更新、`store.set` → `store.save` で即時永続化する
- **スコア計算式・減衰係数・二次キー・常時有効である旨の正本は `requirements/REQUIREMENTS.md`「ファイル検索結果のランキング（frecency）」節**。ここには重複して書かない（外部設計書にも置かない）。**理由**：スコア計算式は「検索結果がどういう順で並ぶか」というユーザー体験の定義そのものであり、実装の都合ではなく要件そのものであるため。係数を変更する場合は REQUIREMENTS.md を更新し、実装をそれに合わせる
- `recordFrecency(path)` はファイル起動時の後処理として `launchFile` の `closeWindow({ cleanup })` の `cleanup` 内で呼ぶ（詳細は [window-lifecycle.md](window-lifecycle.md#close-window-common-design) を参照）。ウィンドウが実際に隠れた後にのみ実行されるため、この呼び出しが引き起こす再レンダーのタイミングを個別に気にする必要はない

同じ frecency の仕組みは [calc-and-prefix-commands.md](calc-and-prefix-commands.md) の「プレフィックスコマンド候補表示」でも `path` を `keyword` に変えて再利用されている。

<a id="folder-detail-settings"></a>

### 検索フォルダごとの詳細設定（Rust / フロントエンド）

設定画面「ファイル検索」タブの検索フォルダ一覧の各行に歯車アイコンボタンを配置し、押下すると `FolderDetailSettingsModal.tsx` が中央オーバーレイのモーダルとして開く。

**データ構造の定義そのもの**（5項目の内容とデフォルト値・ブラックリスト用/ホワイトリスト用を独立フィールドとする方針・後方互換の方針・拡張子フィルタの境界条件）は、外部設計書 `external-design/03-data-model.md#folder-detail-settings` へ移設した。本節には実装上の対応のみを記す。

Rust の `FolderEntry`（`folders: FolderEntry[]`）のフィールド実体：

- `max_depth: u32` / `include_folders: bool`
- `extension_filter_mode: ExtensionFilterMode`（`"blacklist"` | `"whitelist"` の2値 enum。`#[serde(rename_all = "camelCase")]` により JS 側は小文字の文字列として扱う）
- `blacklist_extensions: Vec<String>` / `whitelist_extensions: Vec<String>`（保存時に Rust 側でトリム・先頭 `.` 除去・小文字化・重複除去を行ってから保存する）

新規5フィールドはすべて `#[serde(default = ...)]` を付与しており、外部設計書の後方互換方針（マイグレーション処理を書かない）はこれによって実現している。

`FolderEntry::new(path)` コンストラクタで新規フォルダ登録時（`add_folder`／`add_search_folder_from_paste` の両方）にも同じデフォルト値を設定する（`FolderEntry { path, enabled: true }` のようなリテラル構築を残すと新フィールドの初期値がその都度バラバラになりうるため、コンストラクタに一本化した）。

**保存 UI**：モーダルは「保存」「キャンセル」ボタンを持つ一括保存方式とする。モーダルは5項目をローカル state（ドラフト）で保持し、「保存」押下時に `set_folder_settings(...)` を一度だけ呼ぶ。「キャンセル」はドラフトを破棄してモーダルを閉じるのみで、invoke を呼ばない。エラー状態の保持場所は [settings-panel-architecture.md](settings-panel-architecture.md#error-state-location) の原則に従う。

**拡張子タグ入力 UI**：`ExtensionFilterEditor.tsx`（`FolderDetailSettingsModal.tsx` と `/recent` の表示対象設定の両方から共有されるコンポーネント。切り出しの経緯は「経緯」節を参照）。

**検索ロジックへの反映**（`search_files`、Rust）：

- `WalkDir::new(...).max_depth(dir.max_depth as usize)` でフォルダごとの階層数を反映する
- `entry.depth() == 0`（走査ルート＝検索フォルダ自身）は `include_folders` の値に関わらず常にスキップする
- `is_dir && dir.include_folders` の場合のみディレクトリエントリを結果候補に含める。ファイル（`is_file`）は従来通り常に候補
- 拡張子フィルタリング（`passes_extension_filter`）はファイルのみに適用し、ディレクトリには適用しない。`dir.extension_filter_mode` に応じて `dir.blacklist_extensions`／`dir.whitelist_extensions` のどちらを使うかは呼び出し側（`search_files`）で選んでから渡す（空リスト時・拡張子なしファイルの扱いは外部設計書の「拡張子フィルタの境界条件」を参照）
- アイコン取得（`shell_icon::get_icon_data_url`）はファイル・フォルダ双方に対して既存のまま動作する（`SHGetFileInfoW` はディレクトリにも有効なため個別対応不要）

このロジックは `/recent` の「表示対象設定」（[recent-files.md](recent-files.md) を参照）とも `normalize_extensions`／`passes_extension_filter` を共有している。

<a id="file-launch"></a>

### ファイル起動（Rust）

Win32 API `ShellExecuteW` を直接呼び出し、拡張子に応じたデフォルトアプリで開く。

- `cmd /C start "" <path>` は cmd.exe が `/C` 以降の引数を連結して1つのコマンドラインとして再パースするため、ファイル名に `&` `|` `^` 等の文字が含まれる場合にコマンドインジェクションが発生し得る（検索対象フォルダに攻撃者が任意のファイル名のファイルを置けるケースが脅威モデルになる）。`ShellExecuteW` はファイルパスをコマンドラインとして解釈せず、開く対象のファイルパスとして丸ごと1つの文字列で渡すだけのため、この種のインジェクションが発生しない
- 実装は `open_file(path: &str)`（`#[cfg(windows)]`）。`hwnd` は `None`、`lpoperation`/`lpparameters`/`lpdirectory` は `PCWSTR::null()`（既定の動作に委譲）、`lpfile` にのみ対象パスの UTF-16 文字列を渡す
- 戻り値の `HINSTANCE` は ShellExecute の仕様上、成功時は 32 を超える値、失敗時は 32 以下のエラーコードを返すため、`<= 32` で失敗判定する
- `#[cfg(not(windows))]` 側は `cargo build` を非Windows環境でも通すためのフォールバック（このアプリ自体は Windows 専用）

## 経緯

<a id="extension-list-split-history"></a>

### ブラックリスト・ホワイトリストを独立フィールドに分離した理由

当初は `extensions: Vec<String>` という単一フィールドを両モードで共有していたが、これだと「ブラックリストで入力したタグ一覧を、ホワイトリストに切り替えた瞬間に流用してしまう（あるいはその逆）」という、ユーザーの意図しないデータ共有が起きる。ブラックリスト（除外リスト）とホワイトリスト（許可リスト）は意味的に全く別物であり、モードを行き来しながらそれぞれ別のタグ集合を組み立てたいユースケース（例：一旦ホワイトリストで絞り込みを試してから、ブラックリストでの除外運用に戻す）を考えると、値を共有する設計は構造的に誤りと判断し、2フィールドに分離した。フロントエンド（`FolderDetailSettingsModal.tsx`）側もこれに合わせて `blacklistExtensions`/`whitelistExtensions` の2つの state を持ち、`filterMode` に応じてどちらを表示・編集するかを `activeExtensions`/`setActiveExtensions` で切り替える（タグの追加・削除ハンドラ自体は1本のまま、対象リストだけを動的に differ させる構成。切替時に他方のリストを破棄する処理は行わない＝入力内容は保持される）。

**単一 `extensions` フィールドから2フィールドへ移行した際のマイグレーション方針（決め打ちでリセット）**：旧フィールド名 `extensions` で保存されていた既存データは、どちらのリストへ引き継ぐかの一意な正解がない。本機能はリリース直後（v0.8.0）で実利用者が少なく設定の消失を許容できる時期だったため、複雑な引き継ぎロジックは実装せず、フィールド名の変更によって旧キーが単純に無視され、`#[serde(default)]` で両リストとも空にリセットされる、という serde の既定動作にそのまま委ねた。今後同種の「意味が変わるフィールド分割」を行う場合も、リリース初期で影響範囲が小さいと判断できるなら同様に決め打ちリセットを優先し、複雑な移行コードを書かないこと。

<a id="extension-filter-editor-extraction"></a>

### `ExtensionFilterEditor` を共通コンポーネントへ切り出した経緯

拡張子タグ入力 UI は当初 `FolderDetailSettingsModal.tsx` 専用のローカル実装だった（「他画面での再利用箇所が今のところない」という理由）。`/recent` の表示対象設定（[recent-files.md](recent-files.md) を参照）で2箇所目の利用箇所ができたため、`ExtensionFilterEditor.tsx` として切り出し、両方から共有する方針に変更した。

## 今後の指針

- 拡張子フィルタリングを持つ設定を新設する場合、ブラックリスト用・ホワイトリスト用は必ず独立フィールドとして持たせる（共有フィールドにしない）
- 拡張子タグ編集 UI が3箇所目の利用箇所を持つことになった場合も `ExtensionFilterEditor.tsx` を再利用し、個別実装を増やさない
- リリース初期（実利用者が少ない時期）のフィールド意味変更は、複雑な移行ロジックより決め打ちリセット（`#[serde(default)]` への委譲）を優先する
