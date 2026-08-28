# 最近使ったファイル一覧

対象コード: `src-tauri/src/recent_files.rs`（`get_recent_files`／`resolve_lnk_target_path`／`resolve_sync_engine_local_path`）、`src/hooks/useSearch.ts`（`recentMode`／`hasPrefixMatch`）、`src/components/RecentEditView.tsx`／`RecentEditFooter.tsx`。

## 現在の設計

<a id="recent-mode-and-fetch"></a>

### 呼び出し・L1画面化・フィルタ（フロントエンド）

明示プレフィックスは「`/`（固定） + `appSettings.recentKeyword`（呼び出しキーワード。デフォルト `"recent"`）」の2部構成。issue 0024で検索画面の子状態からL1画面（`App.tsx`の`view === "recentEdit"`）へ再構成した。判定方式は`hasPrefixMatch`（前方一致の真偽値のみを返す。旧`recentModeFilter`は続く文字列の抽出も兼ねていたが役割を分離した）。

- `appSettings.recentFilesEnabled` が `false` の場合はこのモード判定自体を行わない
- 他のプレフィックスキーワード（システムコマンド3つ・クリップボード・お気に入り）と重複できない（`validate_unique_keyword` の対象。詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md#system-command-feature) を参照）
- キーワードは設定画面の「最近使ったファイル」カテゴリで変更可能。`set_recent_keyword(keyword)`（Rust コマンド）は他の `set_*` と同一パターン（空文字列はエラー、重複チェック後にフィールド更新・保存）で実装する

**画面構成**：`RecentEditView.tsx`（ヘッダー：戻るボタン＋ローカル絞り込み入力欄＋[SettingsButton](shared-ui-system.md#settings-button)、本体：既存どおりの1ペイン一覧、フッター：`RecentEditFooter.tsx`）。プレフィックス入力時点で後続文字列は使用せず、画面上部のローカル絞り込み入力欄（`recentEditFilterText`。`useSearch.ts`内の独立した`useState`）は常に空から開始する。判定用の呼び出しクエリ（`search.query`）自体はL1滞在中変更せず凍結したまま維持する（`clipboardMode`と同じ設計パターン。詳細は[window-lifecycle.md](window-lifecycle.md#prefix-mode-l1-promotion)を参照）——この設計により、以下に記す`recentMode`ベースの既存機構（取得・フィルタ・フォーカス回復再取得・世代ID管理）はL1化にあたって一切変更していない。一覧本体は既存の`ResultList`をそのまま再利用する（`RecentEditView.tsx`は`App.tsx`から`ComponentProps<typeof ResultList>`をそのまま受け取って描画するだけで、独自の行UIを持たない）。

`recentMode`が`false → true`になったタイミングで `get_recent_files` を呼び直す。フィルタ文字列が変わるたびには再取得せず、取得済みの一覧をフロントエンド側で表示名（`RecentFile.name`。`.lnk`/`.url` いずれもここに統一済み）への部分一致でフィルタする（`recentResults`）。既に最終アクセス日時降順で取得済みのため、フィルタ後も順序は維持される。

加えて、`recentMode` を維持したままウィンドウが非表示→再表示された場合（フォーカス回復を検知）も取得し直す（[window-lifecycle.md](window-lifecycle.md#prefix-mode-architecture) の「フォーカス回復時再取得テーブル」に `recent` エントリとして登録）。クリップボード履歴は OS のクリップボード変更通知を常時受信しているため非表示中の変化も自動で最新化されるが、最近使ったファイル一覧にはプッシュ通知の仕組みがなく、モード遷移時の1回きりの取得のままだと非表示中にファイルを開く／削除する等の変化が反映されないままになるため、この再取得が必要。フォーカスアウトによる一時的な自動非表示は画面離脱ではないため、次回フォーカス回復時も最近使ったファイル画面を維持する（`view`は変更しない）。

`RecentFile` は既存の `FileEntry` へ `{ name, path, icon: null }`（アイコンなし）としてマッピングし、既存の `ResultList` のファイル検索結果と同じ行 UI・`launchFile` をそのまま再利用する。ファイル検索結果・計算結果・URLエンコード/デコード結果・Web検索候補との関係は排他。frecency によるスコア並び替えは行わない（常に最終アクセス日時順を維持する）。

**確定クローズ（Enter起動・Shift+Enterで格納フォルダを開く）**：`launchFile`/`openContainingFolder`の`recentMode`分岐は、クエリを既定（`"full"`）でクリアしたうえで`closeWindow()`の`cleanup`内で`resetToSearchView`（[window-lifecycle.md](window-lifecycle.md#l1-confirm-close-view-reset)）を呼び、`view`も明示的に検索画面へ戻す。これにより次回ウィンドウ表示時は必ず通常の検索画面から始まる（お気に入りの「確定後も同じ画面に留まる」既存挙動とは意図的に非対称）。Escapeおよび空のローカル絞り込み入力欄での無修飾Backspace（[window-lifecycle.md](window-lifecycle.md#empty-filter-backspace-return)）も同じく検索画面へ戻る。

<a id="recent-web-search-exclusion-bug"></a>

**発見・修正した既存の潜在的な不整合**：`App.tsx`の`webSearchVisible`（Web検索行の表示可否）の判定式には元々`recentMode`の除外が含まれておらず、`query`が常に非空（`"/recent..."`）になる`/recent`表示中に、理論上「Googleで/recentXXXを検索」という無意味なWeb検索行が選択可能になり得た。issue 0024のL1再構成に合わせて`!search.recentMode`（実装上は`!recentEditOpen`相当のタイミング）を追加して修正した。**教訓**：検索画面の子状態として"/" プレフィックスモードを追加する際は、`webSearchVisible`のような「クエリが非空なら成立する」形の判定式すべてに、新しいモードの除外を追加し忘れていないか確認すること。

<a id="recent-files-retrieval"></a>

### 取得（Rust、`recent_files.rs`）

`get_recent_files()`（Rust コマンド）が以下2フォルダの直下（非再帰）を走査し、`.lnk`（ショートカット）・`.url`（インターネットショートカット）を最終アクセス日時（由来ファイル自体の mtime）降順で最大 `MAX_SEARCH_RESULTS`（50）件返す。

1. Windows の Recent フォルダ：Known Folder API（`SHGetKnownFolderPath(&FOLDERID_Recent, ...)`）で取得する。環境によって実パスが異なり得るためハードコードしない
2. Office の Recent フォルダ（`%APPDATA%\Microsoft\Office\Recent`）：対応する Known Folder API が存在しないため `%APPDATA%` 環境変数からパスを組み立てる

**`.lnk` の処理**：`lnk` クレートの `ShellLink::open` でパースし `link_target()` でリンク先ローカルパスを取得する。リンク先が実在しない場合は除外する。`link_target()` は `lnk` クレート側の制約で `panic` しうるため `catch_unwind` で保護し、1件の異常な `.lnk` がプロセス全体を巻き込まないようにする（release ビルドは `panic = "abort"` のため素通しは致命的）。

- 文字コード：`ShellLink::open` はエンコーディング引数を要求する。`GetACP()`（Win32 API）でシステム既定 ANSI コードページを取得し、`encoding_rs` の対応エンコーディング（932 → `SHIFT_JIS` 等）を都度渡す（`system_default_encoding`）

**`.url` の処理**：テキスト（INI形式）としてパースし `URL=` 行の値を取得する。同期ライブラリ（個人 OneDrive 本体・OneDrive for Business の個人領域・SharePoint チームサイトの共有ライブラリ・OneDrive に追加したショートカット等）上のファイルを指す URL のみ、ローカル同期先パスへの変換を試みる（`resolve_sync_engine_local_path`）。

1. レジストリ `HKEY_CURRENT_USER\Software\SyncEngines\Providers\OneDrive` 配下の全サブキーを動的に列挙し、各サブキーの `UrlNamespace`（そのドキュメントライブラリ自体のルート URL）・`FullRemotePath`（実際に同期対象としているサブフォルダの URL）・`MountPoint`（対応するローカル同期先フォルダ）を取得する
2. マッチング・相対パス抽出の基準は、**`FullRemotePath` が空文字列でなければそちらを優先し、空文字列の場合のみ `UrlNamespace` にフォールバックする**。基準の文字列が URL に前方一致するエントリを探し、複数該当する場合は最も長く一致するものを採用する（最長一致優先）。基準がホスト名のみの場合（個人 OneDrive 本体 `https://d.docs.live.net` 等）は、直後に挟まるアカウント識別子セグメントを追加で1つ読み飛ばしてから相対パスとして扱う
3. マッチした残りの相対パス（正規化済み）を `MountPoint` と結合してローカルパスを組み立てる。実在確認は呼び出し元（`process_url`）が行う

表示名はファイル名から末尾の `.url` を除いたもの。ソートキーは変換の成否に関わらず `.url` 自体の mtime。

Windows の Recent フォルダと Office の Recent フォルダの両方に同一のローカルパスを指すエントリが存在する場合は1件に統合する（mtime が新しい方を採用）。`.lnk` 由来・`.url` 由来（ローカルパス変換成功済み）を問わず同じ統合ロジックを適用する。

<a id="recent-display-settings"></a>

### `/recent` の表示対象設定（Rust / フロントエンド）

データ構造：`FolderEntry`（ファイル検索の検索フォルダごとの詳細設定）とは独立させ、`/recent` 機能全体で共有する単一のグローバル設定として `AppSettings` に直接持たせている。

- `recent_include_folders: bool`（デフォルト `false`）
- `recent_extension_filter_mode: ExtensionFilterMode`（ファイル検索と同じ enum を再利用。デフォルト `"blacklist"`）
- `recent_blacklist_extensions: Vec<String>` / `recent_whitelist_extensions: Vec<String>`（デフォルトいずれも空）

新規4フィールドはすべて `#[serde(default)]` を付与している。拡張子タグの正規化（トリム・先頭 `.` 除去・小文字化・重複除去）は `normalize_extensions`（`main.rs`）を、拡張子フィルタリングの判定は `passes_extension_filter`（`main.rs`）を、いずれもファイル検索の検索フォルダ詳細設定と共有する（詳細は [file-search-and-frecency.md](file-search-and-frecency.md#folder-detail-settings) を参照）。

保存：`set_recent_display_settings(includeFolders, extensionFilterMode, blacklistExtensions, whitelistExtensions)`（Rust コマンド）が4項目を一括保存する。UI（`RecentFilesSettings.tsx`）の拡張子フィルタリング編集 UI は `ExtensionFilterEditor.tsx` を共有する（詳細は [file-search-and-frecency.md](file-search-and-frecency.md#extension-filter-editor-extraction) を参照）。

`get_recent_files` の6段階パイプライン（列挙→mtime降順ソート→保持期間による足切り→表示件数上限による足切り→リンク先解決/ローカルパス変換/実在チェック→重複統合）は変更しない。「表示対象設定」の判定は5番目の段階（`process_lnk`/`process_url`）に組み込む。そのため、拡張子フィルタリングやフォルダ除外によって対象外と判定されたエントリも、既存の「実在しない・変換失敗のエントリ」と同様に4番目の段階より後で除外される＝最終的な表示件数が `max_results` よりやや少なくなることがある、という既存の許容仕様がそのまま適用される。

- `.lnk`（`process_lnk`）：リンク先の実在チェック（UNC 以外）で取得した `Metadata::is_dir()` の結果を使い、フォルダなら `include_folders` に従う（`false` なら除外）。ファイルの場合のみ、リンク先ローカルパスに対して `passes_extension_filter` を適用する。UNC パスは常にファイル扱いとして拡張子フィルタリングのみ適用する
- `.url`（`process_url`）：判定順序を意図的に「表示対象設定の判定が最優先」に組み替えている（詳細は「経緯」節を参照）

<a id="open-containing-folder"></a>

### 格納フォルダを開く（Shift+Enter）（Rust / フロントエンド）

対象：通常のファイル検索結果、`/recent` の結果一覧の両方（いずれも `useSearch.ts` の `results` state を共有しているため、キーボード操作側は由来を区別しない）。

選択中に Shift+Enter を押すと、対象ファイルの親フォルダをエクスプローラーで開く。通常の Enter によるファイル起動と同様にウィンドウを閉じる（[window-lifecycle.md](window-lifecycle.md#close-window-common-design) の `closeWindow` を経由）。

- `open_containing_folder(path)`（Rust コマンド）：`path` の拡張子が `.lnk`（大小文字区別なし）の場合、`resolve_lnk_target_path(path)` でリンク先ローカルパスを解決し、解決できればそちらの親フォルダを、できなければ `.lnk` 自身の親フォルダを開く。`.lnk` 以外はそのまま `path` の親フォルダ（`Path::parent()`）を開く。フォルダを開く処理自体は既存の `open_file`（[file-search-and-frecency.md](file-search-and-frecency.md#file-launch) を参照）をそのまま流用する
- `resolve_lnk_target_path` は「最近使ったファイル一覧」の `.lnk` 処理（`process_lnk`）からリンク先ローカルパスの解決部分だけを切り出した共通関数。`process_lnk` はこの関数を呼んだうえで実在チェック・フォルダ除外を追加で行う一覧生成用のラッパーになっている。`open_containing_folder` はこの関数を実在チェックなしでそのまま呼ぶ（`.lnk` 自体が通常のファイル検索結果に出現している時点で実在は保証されているため）
- フロントエンド：`openContainingFolder(path)` は `launchFile` と同じ「ウィンドウを閉じる」経路を通る。frecency は記録しない（ファイルを起動したわけではないため）
- `App.tsx` の `handleKeyDown` で `e.shiftKey` を判定し、計算結果・URLエンコード/デコード結果・Web検索行のインデックスオフセットを踏まえた同一の計算式で対象ファイルを求める（現在は `rows[selected].kind === "file"` ベースの判定。詳細は [result-list-and-selection.md](result-list-and-selection.md#adding-a-row-kind) を参照）。計算結果・Web検索行等が選択中の場合は自然に無効化される

## 経緯

<a id="onedrive-double-folder-bug"></a>

### `FullRemotePath` と `MountPoint` の対応関係（二重フォルダ名バグ）

Teams サイト形式のマウントでは、`MountPoint`（ローカルフォルダ）は `UrlNamespace`（ライブラリ全体のルート）ではなく `FullRemotePath`（実際に同期対象としているサブフォルダ）に対応している（実機で確認: `UrlNamespace` が `.../Shared Documents/`、`FullRemotePath` が `.../Shared Documents/General`、`MountPoint` が `...\Team A - General` のとき、`MountPoint` は `FullRemotePath` の末尾フォルダ `General` に対応する）。これを見落として `UrlNamespace` を基準に相対パスを計算すると、`UrlNamespace` と `FullRemotePath` の差分（`General`）が `MountPoint` に含まれる分と重複し、`...\Team A - General\General\...` のようにフォルダ名が二重になる不具合になる（実機ログで発見・修正済み）。個人 OneDrive（`personal/...` 形式）では `FullRemotePath` が空文字列で登録されるため、この場合は差分計算の必要がなく `UrlNamespace` をそのまま基準にする。

<a id="percent-encoding-normalization-bug"></a>

### パーセントエンコーディングの正規化漏れ

レジストリの `UrlNamespace`/`FullRemotePath` は生の文字列（例: `Shared Documents`）で登録される一方、`.url` の `URL=` 値はパーセントエンコード済み（例: `Shared%20Documents`）であり、両者の表記が食い違う場合がある。個人 OneDrive（`d.docs.live.net`）は基準がエンコード不要な区間（ホスト名のみ）でたまたま一致していたため表面化しなかったが、SharePoint チームサイトのように基準の文字列自体が半角スペースや日本語のサイト名等を含む場合、生の文字列同士の前方一致では不一致となり変換に失敗する（実機で SharePoint チームサイトのショートカット経由ファイルが `/recent` 一覧に出ないバグとして発見・修正済み）。これを吸収するため、比較・相対パス抽出は基準の文字列・URL 双方をパーセントデコードで正規化した文字列同士で行う（`%20` だけの個別対応ではなく、非ASCII文字も含めて救える汎用的な正規化処理にしてある）。

ショートカット名（`MountPoint` に対応するローカルフォルダ名）をユーザーが変更しても、OneDrive クライアント側の同期タイミングに応じてレジストリの `MountPoint` 値が追従して更新される（反映まで数分〜PC再起動を要する場合がある）ため、アプリ側で特別な対応・注釈は不要と判断している。

<a id="url-filter-order-optimization"></a>

### `.url` の表示対象設定を「レジストリ変換より先」に判定する最適化

**パフォーマンス最適化として、判定順序を意図的に「表示対象設定の判定が最優先」に組み替えている。** `.url` ファイル名（＝拡張子除去後の表示名）だけで拡張子フィルタリング・フォルダ的参照の判定が完結する（`.url` 本体の読み込み・`URL=` 行のパース・レジストリを使ったローカルパスへの変換のいずれも不要）ため、この判定を最初に行い、対象外と分かった時点でそれらの重い処理（特にレジストリ列挙を伴う `resolve_sync_engine_local_path`）自体を一切実行せずに早期リターンする。この最適化は、対象外の `.url` に対して旧実装（実在チェック後に表示名のフォルダ判定のみ行っていた）よりファイル I/O ・レジストリアクセスの両方を削減できる。

## 今後の指針

- OneDrive のレジストリ情報を使った URL→ローカルパス変換ロジックに手を入れる場合、`FullRemotePath` と `UrlNamespace` の使い分け（[onedrive-double-folder-bug](#onedrive-double-folder-bug)）とパーセントエンコーディングの正規化（[percent-encoding-normalization-bug](#percent-encoding-normalization-bug)）の両方を必ず踏まえる。個人 OneDrive のテストだけでは Teams サイト・SharePoint 固有の不具合を再現できないため、可能ならどちらの構成でも検証する
- `.url`／`.lnk` のような「軽い判定→重い処理」の順で処理できる項目を追加する場合、`.url` の表示対象設定と同様に、軽い判定を先に行って対象外を早期リターンする最適化を検討する
- 検索画面の子状態だった"/" プレフィックスモードをL1画面へ昇格する場合、[window-lifecycle.md](window-lifecycle.md#prefix-mode-l1-promotion)のパターン（判定クエリを凍結、ローカル絞り込みは独立state）に乗せる。あわせて`webSearchVisible`等「クエリが非空なら成立する」形の判定式に新しいモードの除外が必要かを必ず確認する（[recent-web-search-exclusion-bug](#recent-web-search-exclusion-bug)を参照）
