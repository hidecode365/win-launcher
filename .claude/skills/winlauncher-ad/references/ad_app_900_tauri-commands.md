# Tauri コマンド

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
| `set_recent_display_settings(includeFolders, extensionFilterMode, blacklistExtensions, whitelistExtensions)` | `/recent` の「表示対象設定」（フォルダを対象に含めるか・拡張子フィルタリング）をまとめて保存して `AppSettings` を返す。`FolderEntry` とは独立した /recent 機能全体のグローバル設定。拡張子タグの正規化は `set_folder_settings` と同じ `normalize_extensions` を使う（詳細は [recent-files.md](../../../../docs/internal-design/recent-files.md#recent-display-settings) を参照） |
| `get_recent_files()` | Windows の Recent フォルダ・Office の Recent フォルダから最近使ったファイル一覧（`.lnk`/`.url` 由来、OneDrive パス解決込み）を最終アクセス日時降順で返す（最大50件）。「表示対象設定」（フォルダを対象に含めるか・拡張子フィルタリング）を反映する（詳細は [recent-files.md](../../../../docs/internal-design/recent-files.md#recent-display-settings) を参照） |
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
