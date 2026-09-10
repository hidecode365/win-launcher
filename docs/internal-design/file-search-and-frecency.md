# ファイル検索・frecencyランキング・検索フォルダ詳細設定

対象コード: `src-tauri/src/main.rs`（`search_files`／`FolderEntry`／`open_file`／`get_search_folder_info`／`Generation`）、`src/hooks/useSearch.ts`（frecencyスコア計算・検索ディスパッチ）、`src/components/FileSearchSettings.tsx`／`FolderDetailSettingsModal.tsx`／`ExtensionFilterEditor.tsx`／`FolderInfoModal.tsx`／`ExcludedFilesModal.tsx`。

## 現在の設計

<a id="search-logic"></a>

### 検索ロジック（Rust）

- `appSettings.fileSearchEnabled` が `false` の場合、フロントエンドは `search_files` を呼ばず検索結果を表示しない
- 検索対象フォルダは設定で複数登録可能（有効/無効を個別に切替）
- 有効なフォルダのみ `walkdir` で再帰走査（シンボリックリンク追跡あり）。最大深さはフォルダごとの詳細設定（`max_depth`。デフォルト3）に従う（詳細は [folder-detail-settings](#folder-detail-settings) を参照）
- クエリを小文字変換してファイル名に部分一致
- 全フォルダ合計で設定可能な検索上限件数（`appSettings.searchMaxResults`。デフォルト100、1〜400。設定UIは「検索フォルダ」タブの「詳細設定」内）に絞って返却する。戻り値は`Vec<FileEntry>`ではなく`SearchOutcome { files, truncated }`で、上限到達により後続の検索対象フォルダを走査せず打ち切ったかどうかを`truncated`で表す（判定方式・フロントエンドでの表示は[shell-icon-loading.md](shell-icon-loading.md#search-truncated-outcome)を参照）
- 走査ルート自身（`WalkDir` の depth 0 エントリ、＝検索フォルダそのもの）は「フォルダ自体を検索対象に含める」設定に関わらず結果に含めない
- 返却する各`FileEntry`の`icon`は常に`None`（Shellアイコンはここでは取得しない）。Shellアイコンの取得は候補収集から分離されており、表示範囲優先で別途非同期に取得する。取得方式（`SHGetFileInfoW`によるアイコン取得・PNG/Base64エンコード・取得失敗時のフォールバック）と表示範囲優先取得の仕組みは[shell-icon-loading.md](shell-icon-loading.md)を参照
- ピン止め済みファイルの除外（`exclude_paths` 引数）は [favorites-data-model.md](favorites-data-model.md) を参照

<a id="search-cooperative-cancellation"></a>

### 通常検索のcooperative cancellation（issue 0030）

通常検索は、新しい検索文字列を受け付けるたびに実行中の古い走査を強制中断せず、Rust側の共有世代番号と処理境界ごとの自己申告チェックで「自分がまだ最新か」を確認しながら進める、協調的なキャンセル方式を採る。

- **Rust側**：`main.rs`の`Generation`（`AtomicU64`のラッパー、`main.rs:225`）が`SEARCH_GENERATION`（`main.rs:238`、通常検索専用）を保持する。`set_search_generation`（`main.rs:246`。実行中の重い処理を待たずに即座に呼べる軽量コマンド）が新しい要求を受け付けた時点で世代を更新し、`search_files`（`main.rs:2949`）自身も実行開始時に同じ世代番号を設定したうえで、**検索フォルダの処理前後・フォルダ走査中の各エントリの処理境界**で`SEARCH_GENERATION.is_current(generation)`を確認する。一致しなくなった時点で自身をobsoleteとみなし、それ以降の処理（残りのフォルダ走査・結果追加）を打ち切って早期returnする
- 同じ`Generation`の仕組みを検索フォルダ情報ダイアログ（`get_search_folder_info`）も`FOLDER_INFO_GENERATION`という独立インスタンスで使う（詳細は[folder-info-dialog](#folder-info-dialog)を参照）。**新しく「重い走査を打ち切り可能にしたい」Rustコマンドを追加する場合、この`Generation`パターンを再利用し、個別のフラグ・チャネルを新設しない**
- **フロントエンド側**：世代番号自体は`window-lifecycle.md`の[asyncCallIdRef](window-lifecycle.md#prefix-mode-architecture)が持つ`"search"`キーの値をそのまま流用する（JS側の「最新の呼び出しか」判定とRust側の「最新の世代か」判定を同じ数値で表現し、専用カウンタを別に持たない）。`searchInFlightRef`（実行中は最大1件）・`searchQueueRef`（実行中に新しい検索文字列を受け付けた場合、待機要求を最新1件だけで上書きする。途中の文字列をFIFOで蓄積しない）による1件直列ディスパッチが、`invoke("search_files", ...)`を発行する（`useSearch.ts`の`runQueuedSearchRef`）。待機中でもキュー投入と同時に`set_search_generation`を呼び、実行中の`search_files`へ早期終了の合図を送る（invoke自体は1件ずつ直列発行だが、実行中の重い同期処理を割り込ませるための軽量な合図は別送する）
- 通常検索以外のモード（`/recent`・お気に入り・クリップボード履歴・プレフィックスコマンド・パス貼り付けウィザード）へ移行する際は`abandonSearchOnModeExit()`を呼ぶ。フロントエンド側の世代を進めて`"search"`キーの最新性を握り、`set_search_generation`で実行中・待機中の通常検索へobsolete検知の合図を送ったうえで、待機要求（`searchQueueRef`）を破棄しスピナーも即座に終了する。**開始済みの同期I/O・invoke自体は強制停止しない**（戻ってきた時点で`isLatestAsyncCall`が`false`になるため、その結果は`results`へ反映されない）
- この方式を選んだ理由：`AbortController`によるTauri invoke自体の中断は、Tauri v2の標準機構では中断シグナルをRust側の同期処理まで伝播できないため不採用とした。共有world世代番号によるポーリング的な確認が、既存のRust実装（`walkdir`の同期ループ）に対して現実的な最小実装と判断した

<a id="search-continuity-and-spinner"></a>

### 検索中表示：直前結果の保持と100ms遅延スピナー

通常検索の再実行中は「検索中…」という一覧行を表示せず、直前に完了したファイル検索結果をそのまま表示し続ける。最新世代の結果が確定した時点で、ファイル検索結果だけを一括置換する（`useSearch.ts`の`resultsQueryRef`が「`results`が現在どの検索文字列に対する結果か」を保持し、置換時に同期して更新する）。

- **採用の経緯**：当初案は「旧結果を即時除去し、非選択の『検索中…』行を表示する」というものだったが、実機確認でちらつきが許容不可と判定され、この「直前結果を保持し続ける」方針へ差し戻した（`3188ee4`）
- 初回検索など直前の結果がない場合はファイル結果を空のままとする。最新世代が空結果またはエラーで完了した場合は、保持していた旧ファイル検索結果を消去する（案内行〈[非選択の情報行](result-list-and-selection.md#non-selectable-row)〉もあわせて消す）
- ピン止め・数式計算・URLエンコード/デコード・パス貼り付け候補などの固定候補は、ファイル検索の完了を待たず現在の検索文字列へ即時更新する（ファイル検索結果とは別の表示世代として扱う）。**ただしピン止めブロックのquery空・非空切替だけは例外的にファイル検索結果の確定境界へ同期する**（[displayedPinnedVisible](result-list-and-selection.md#pinned-visible-confirm-boundary)を参照）
- **検索欄周囲のスピナーは、検索開始から`searchBusyRef`が100msを超えて継続している場合だけ表示する**（`useSearch.ts`の`startSearchBusy`/`endSearchBusy`/`searchSpinnerVisible`）。この100msはちらつき防止のためのフロントエンド側表示判定であり、検索処理自体のタイムアウトではない。アイドル状態から検索中状態へ移行した時だけ100ms監視を開始し、検索中に新しい世代を受け付けても監視を再起動しない（連続する最新要求の処理中は一つの検索中状態として扱い、要求ごとにスピナーを点滅させない）

<a id="frecency"></a>

### ファイル検索結果の frecency ランキング（フロントエンド）

`search_files` が返したファイル一覧を、フロントエンド側で frecency スコアの降順に並び替えて表示する（Rust 側のソート処理は不要）。

- 履歴データは `@tauri-apps/plugin-store` の JS API（`Store.load("settings.json")`）から直接読み書きする
  - Rust 側（`tauri-plugin-store` の `app.store()`）と JS 側（`Store.load()`）は同じ `settings.json` を共有する同一のストアコレクションを参照するため、Rust 側にコマンドを追加せずフロントエンドだけで永続化が完結する
  - JS から直接ストア操作を呼べるよう、`capabilities/default.json` に `store:allow-load` / `store:allow-get` / `store:allow-set` / `store:allow-save` permission を追加している（削除・クリア等の破壊的操作は使わないため付与しない）
  - キー名は `"frecency"`、値は `{ [path: string]: { count: number, lastUsed: number } }`（`lastUsed` は UNIX タイムスタンプ ms）
- アプリ起動時（マウント時）に `frecency` を読み込み、`useState` と同期する `useRef` の両方で保持する（`useRef` は `useCallback` の古いクロージャ参照を避けるため、`useState` は再レンダリングのトリガー用）
- ファイル起動時（Enter／クリックいずれも `launchFile` 経由）に対象パスの `count` をインクリメントし `lastUsed` を現在時刻で更新、`store.set` → `store.save` で即時永続化する
- **スコア計算式・減衰係数・二次キー・常時有効である旨の正本は `requirements/00-requirements.md`「ファイル検索結果のランキング（frecency）」節**。ここには重複して書かない（外部設計書にも置かない）。**理由**：スコア計算式は「検索結果がどういう順で並ぶか」というユーザー体験の定義そのものであり、実装の都合ではなく要件そのものであるため。係数を変更する場合は 00-requirements.md を更新し、実装をそれに合わせる
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

<a id="folder-info-dialog"></a>

### 検索フォルダ情報ダイアログ（issue 0030）

設定画面「ファイル検索」タブの検索フォルダ一覧の各行から`FolderInfoModal.tsx`（情報アイコンボタン）を開くと、対象フォルダ直下を1階層目として**最大20階層まで**を1回の走査で集計し、最大フォルダ階層数・全ファイル数・現在の設定（階層数・拡張子フィルタ）を適用した後のファイル数を表示する。

- **通常検索とは独立した実行状態・世代管理を持つ**：Rustコマンド`get_search_folder_info`（`main.rs:841`）は`FOLDER_INFO_GENERATION`（`main.rs:239`。通常検索の`SEARCH_GENERATION`とは独立したインスタンス）を使い、[通常検索のcooperative cancellation](#search-cooperative-cancellation)と同じ`Generation`パターンで走査を打ち切り可能にする。`FolderInfoModal.tsx`側は`generationRef`（コンポーネントローカル）を持ち、ダイアログを閉じる（unmount）・対象フォルダが変わる（`folder.path`の変化）のいずれでも、`useEffect`のcleanupで新しい世代番号を`set_folder_info_generation`（`main.rs:254`）へ即座に通知し、走査中の旧要求をobsolete化する
- キャッシュは持たない（開くたびに走査し直す）。サブ項目単位の読み取り不能は`partialError`（部分エラー、他の項目は表示を続ける）、ルート自体の確認不能は全体エラー（`error`、集計結果を一切表示しない）として区別する
- 20階層を超えて実際のフォルダ階層が続く場合、正確な最大階層数は求めず「20階層以上」と表示する（`maxDepthExceedsMax`）

<a id="excluded-files-modal"></a>

### 除外ファイル一覧ダイアログ（issue 0030）

`ExcludedFilesModal.tsx`は、フォルダ情報ダイアログの「除外されたファイル」リンクから開く。**追加のファイルシステム走査は行わず**、フォルダ情報ダイアログが取得済みの`SearchFolderInfo`（[folder-info-dialog](#folder-info-dialog)と同じ20階層走査）をそのまま使う。

- 現在の検索階層数（`max_depth`）または拡張子フィルタにより「現在の設定で検索対象となるファイル数」に含まれなかったファイルを対象とし、フォルダ・読み取り不能項目は一覧に含めない。表示順は走査順とする
- 最大200件で打ち切り、超過時は「除外されたファイルは200件を超えるため、先頭200件のみ表示しています。」と表示する（`excludedFilesTruncated`）
- フォルダ情報ダイアログの**上に重ねて表示する**モーダルであり、Escapeの優先順位チェーンでは常に最優先（除外ファイル一覧→フォルダ情報→他の優先順位、の順で閉じる）で処理する。独自のキーイベント購読は持たず、呼び出し元（`FileSearchSettings.tsx`）が開閉状態（`excludedFilesOpen`）を保持して優先順位チェーンへ組み込む（新しく別モーダルの上に重ねるサブモーダルを追加する場合も、この「開閉状態は呼び出し元が持ち、Escape優先順位チェーンへ組み込む」形に乗せる）

<a id="search-folder-reordering"></a>

### 検索フォルダの並び替え（専用ドラッグハンドル）

検索フォルダ一覧の並び替え（`FileSearchSettings.tsx`）は、行全体ではなく**専用のドラッグハンドル（⋮⋮）だけ**に`draggable`を付与する。パス表示・チェックボックス・詳細設定・フォルダ情報・削除の各操作要素はドラッグの起点にならない。

**ピン止めブロック・お気に入り編集ビューの「行全体が`draggable`」という既存パターン（[favorites-data-model.md](favorites-data-model.md#dnd-reordering)を参照）とは意図的に異なる**：検索フォルダ行はパス文字列のクリックでフォルダを開く操作（[settings-panel-architecture.md](settings-panel-architecture.md)を参照）や複数の操作アイコンを同じ行に持ち、行全体をドラッグ起点にすると誤操作が起きやすいため、ドラッグの起点をハンドルだけに限定する。新しく検索フォルダ行に類する「複数の独立した操作を持つ設定一覧行」のD&Dを実装する場合は、行全体ドラッグではなくこの専用ハンドル方式を検討する。

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
