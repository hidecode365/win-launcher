# Shellアイコンの表示範囲優先取得

対象コード: `src-tauri/src/main.rs`（`shell_icon`モジュール、`get_icons_for_paths`、`search_files`の`SearchOutcome`）、`src-tauri/src/recent_files.rs`（`process_lnk`／`process_url`）、`src/hooks/useShellIconCache.ts`、`src/hooks/useVisibleRangeIconFetch.ts`、`src/components/ResultList.tsx`、`src/components/FavoriteEditTree.tsx`。

横断アーキテクチャ系のファイル。通常検索・ピン止めブロック・お気に入り（`/favorite`）・最近使ったファイル（`/recent`）の4画面が対象。新しくShellアイコンを表示する画面を追加する場合は、このファイルの設計に乗せること。

## 現在の設計

<a id="candidate-icon-separation"></a>

### 候補収集とShellアイコン取得の分離（issue 0031）

対象4経路（`search_files`・`get_pinned_files`・`recent_files.rs`の`process_lnk`／`process_url`）は、いずれも候補（識別子・表示名・パス・ファイル/フォルダ種別）を`icon: None`のまま返す。Shellアイコン自体は取得しない。実在確認・一覧採用条件（拡張子フィルタ・フォルダ除外等）の判定ロジックは変更していない（`resolve_icon`呼び出し自体を削除しただけで、それより前にある判定の分岐は無変更）。

- `FileEntry`／`RecentFile`の`icon`フィールドは元々`Option<String>`のため、常に`None`を返す変更は型を変えずに済む
- `shell_icon::resolve_icon`（`main.rs:566`。実体→種類→汎用のフォールバック順、UNC/ネットワークドライブ判定は無変更）の呼び出し元は、`get_icons_for_paths`（`main.rs:1311`。パス配列→アイコン配列の汎用バッチコマンド）1箇所へ統合された。お気に入り画面はissue 0031以前からこのコマンドでアイコンを取得しており、新規のIPCコマンドは追加していない
- Shellアイコンを一切取得しない状態変化のため、`DriveTypeCache`（コマンド呼び出し単位の揮発キャッシュ）の生成箇所も`get_icons_for_paths`だけに集約された

<a id="search-truncated-outcome"></a>

### `search_files`の戻り値と検索打ち切り判定

`search_files`（`main.rs:2949`）は`Vec<FileEntry>`ではなく`SearchOutcome { files: Vec<FileEntry>, truncated: bool }`（`main.rs:335`）を返す。`truncated`は検索上限件数に到達し後続の検索対象を走査せず打ち切ったかどうかを表す。

- 上限`N`件に到達した時点で、**現在の検索フォルダの`WalkDir`イテレータの残りエントリの範囲内でのみ**、既存の一致判定（クエリ一致・除外パス判定）を適用して`N+1`件目に該当する候補の有無を確認する（Shellアイコン取得は行わない）
- 見つかれば`truncated = true`で確定する。見つからず現在の検索フォルダを使い切った場合は、設定済みの検索フォルダ一覧に後続の有効な検索フォルダが1件でも残っているかどうか（ファイルシステムへは触れない、設定データの参照のみ）で判定する：残っていれば`truncated = true`（保守的な近似）、これが最後の有効フォルダなら`truncated = false`（正確）
- **この判定方式（B近似）は、後続フォルダに実際には候補が無い場合でも案内行が表示される誤検知の残余リスクを承認済みで許容している。** 「検索上限件数に達した時点で後続の検索フォルダは走査しない」という既存契約（要件定義01）を厳密に守るための意図的なトレードオフであり、精度を上げるために後続フォルダへファイルシステムアクセスを追加してはならない
- `truncated: true`をフロントエンドがどう表示するか（非選択案内行）は[result-list-and-selection.md](result-list-and-selection.md#non-selectable-row)を参照

<a id="visible-range-icon-fetch"></a>

### 表示範囲優先取得（`useShellIconCache`／`useVisibleRangeIconFetch`）

候補一覧はアイコンなしで即座に表示し、Shellアイコンは表示範囲（表示中の行＋直後`SHELL_ICON_LOOKAHEAD`行、初期値8。`useShellIconCache.ts:23`）だけを優先して非同期に取得する。

- **`useShellIconCache`（`useShellIconCache.ts:32`）**：パスをキーにした、画面横断で共有する単一のアイコンキャッシュ。`resolve_icon`の結果はパスだけに依存し、検索文字列・画面モード・取得時刻には依存しないため、1つのパスのアイコンはどの画面・どの検索文字列から要求されても同じ結果になる。**このためキャッシュを画面横断で共有してよく、「検索文字列変更・画面切替・再取得で古くなった要求の結果を現在の一覧へ反映しない」という要件を、行の識別子や検索世代を別途持ち回ることなく、パスをキーにした素朴なキャッシュとして実現している。** 同時実行数は1に固定する（下記「同時実行数を1に固定する理由」を参照）。1回のバッチ取得は`get_icons_for_paths`を1回呼ぶだけで、複数の`invoke`を並行発行しない。取得に失敗したパスは無限に再試行しない
- **`useVisibleRangeIconFetch`（`useVisibleRangeIconFetch.ts:16`）**：`IntersectionObserver`で一覧コンテナ内の`[data-index]`要素を監視し、表示中の行の直後`lookahead`行までのパスを`requestIcons`へ渡す。既存の`data-index`属性・スクロールコンテナ（`overflow-y-auto`な単一div）をそのまま流用し、追加のDOM構造は必要としない。観測対象の再構築は一覧の要素数（`itemCount`）が変わった時だけ行い、内容が変わらない並び替え等では再構築しない（実機頻度が低いための意図的な簡略化）
- 呼び出し側：`ResultList.tsx:128`（通常検索・ピン止めブロック・`/recent`）、`FavoriteEditTree.tsx:443`（お気に入り）。`prefixCommandMode`中は`itemCount`を`0`にしてフックを無効化する（候補一覧はShellアイコンを使わない固定SVGのため取得不要で、かつその間`rows`とDOM上の`[data-index]`要素数が一致しないため）
- 取得完了時は対応する行のアイコンだけを置き換え、行の高さ・順序・選択・Enter／クリックの対象・スクロール位置を変更しない。`rows`の並び順は`sortByFrecency`等（フロントエンド、Rust応答受信直後）で既に確定し、選択解決（`resolveSelected`）は`item.key`（`file:${path}`等）で識別子照合を行うため、`icon`フィールドが後から書き換わっても並び順・選択には影響しない（[selection-is-derived](result-list-and-selection.md#selection-is-derived)の原則と矛盾しない）

<a id="single-fetch-concurrency"></a>

### 同時実行数を1に固定する理由

`resolve_icon`が呼ぶ`SHGetFileInfoW`はWin32シェルAPIであり、本コードベースには複数スレッドから同時に呼び出す既存の実装例が無い（`shell_icon`モジュール・`recent_files.rs`いずれも単一ループ内の逐次呼び出しのみ）。Shell API・COM系APIはスレッドのアパートメント初期化（`CoInitializeEx`等）に依存する場合があるが、本コードベースには明示的な`CoInitialize`呼び出しがどこにも無い。OCR機能（`windows::Media::Ocr`使用）も逐次実行のみで並列呼び出しの前例にならない。**複数スレッドからの`SHGetFileInfoW`同時呼び出しが安全かどうかは未検証であり、安全性を確認できるまで同時実行数を1より大きくしないこと。** 既存計測（1件あたり概算2.7〜8.5ms）を踏まえると、表示範囲だけに件数を絞ること自体の効果が支配的であり、同時実行数1（逐次）でも体感上の恩恵の大部分は得られる。

## 経緯

<a id="favorites-full-fetch-removed"></a>

### お気に入りの全件一括取得を表示範囲優先取得へ置き換えた経緯

issue 0031以前は、お気に入り画面（`/favorite`）のみ既存のShellアイコン取得経路を持たず、`get_favorite_nodes`（構造のみ取得）の直後に`get_icons_for_paths`をツリー**全件**分のパスでまとめて呼んでいた（構造とアイコンを分離した先行事例ではあったが、アイコン取得自体は「表示範囲」ではなく「全件」だった）。issue 0031でこの全件一括取得（および専用の`favoriteIcons` state）は撤去し、`useShellIconCache`／`useVisibleRangeIconFetch`による表示範囲優先取得へ統一した。

## 今後の指針

- Shellアイコンを表示する新しい画面を追加する場合、Rust側は候補を`icon: None`のまま返し、`useVisibleRangeIconFetch`で表示範囲のパスを`useShellIconCache.requestIcons`へ渡す既存の型に乗せる。画面専用のアイコン取得コマンド・専用のキャッシュ state を新設しない
- 同時実行数を2以上へ増やす変更は、複数スレッドからの`SHGetFileInfoW`同時呼び出しの安全性を別途検証してから行う（[single-fetch-concurrency](#single-fetch-concurrency)を参照）
- `resolve_icon`自体（フォールバック順・ドライブ判定）に手を入れる場合、呼び出し元は`get_icons_for_paths`1箇所のみであることを踏まえる
