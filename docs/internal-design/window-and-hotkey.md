# ウィンドウの見た目・サイズとグローバルホットキー

対象コード: `tauri.conf.json`、`src/App.tsx`（ルート要素の透過スタイル・リサイズ購読）、`src-tauri/src/main.rs`（`setup()` でのサイズ復元・ホットキー登録、`set_hotkey` コマンド）。

ウィンドウの表示/非表示・フォーカス管理といった状態遷移の設計は [window-lifecycle.md](window-lifecycle.md) を参照。本ファイルはウィンドウそのものの見た目・サイズ・入力（ホットキー）の設計を扱う。

## 現在の設計

<a id="frameless-and-centering"></a>

### フレームなし・中央表示

`decorations: false` でフレームなし、`tauri.conf.json` の `center: true` に加え、ウィンドウを表示するすべての箇所（グローバルホットキー / トレイ「Show」/ トレイアイコンクリック）で `show()` 直前に Rust 側から `window.center()` を呼び出して画面中央に表示する。

- `tauri.conf.json` に `x` / `y` 座標は設定しない（位置を永続化しないため）
- ドラッグで移動した位置は保持しない。非表示→再表示のたび（フォーカスアウトによる自動非表示からの再表示も含む）に必ず中央へ戻す

<a id="transparency-and-shadow"></a>

### 透過・角丸・シャドウ

**原則：以下3つの設定は個別に変更せず、常にセットで扱う。**

1. `tauri.conf.json` の `backgroundColor` を alpha 0 にする
2. DOM 側（`html`／`body`／`#root`）に `background: transparent` を明示する
3. `tauri.conf.json` の `shadow` を `false` にする（影は CSS で代替する）

**1つだけ変更すると、角のアーティファクト（角丸の外側に残る薄い線・にじみ）が再発する。** 3つはいずれも「ウィンドウ・WebView・DOM という異なるレイヤーの透過を一貫させる」という同一の目的のための設定であり、どれか1つでも欠けるとそのレイヤーだけが不透明のまま残るため。以下は各設定の具体的な理由。

`transparent: true` + CSS `border-radius` で角丸を実現（Fluent ライクなアクリル風 UI）。

- `tauri.conf.json` の `backgroundColor` を `[0, 0, 0, 0]`（alpha 0）に明示設定する。Windows では WebView2 のデフォルト背景が不透明なため、未設定だと角丸の外側にうっすら線（コーナーのにじみ）が見えるアーティファクトが出る
- `html` / `body` / `#root` にも `background: transparent` を明示し、ウィンドウ・WebView・DOM の各レイヤーで透過を一貫させる
- `tauri.conf.json` の `shadow` は `false` にする。ネイティブの drop shadow は矩形の DWM 拡張フレームに対して描画されるため、CSS の角丸クリップ領域と境界が一致せず、角の外側に薄い線が残るアーティファクトが出る。影は `App.tsx` 側の CSS（Tailwind `shadow-2xl`）で代替する

<a id="basic-window-config"></a>

### 基本ウィンドウ設定

起動時は `visible: false`（非表示）。`skipTaskbar: true`、`alwaysOnTop: true`。

ヘッダー行（検索バー / 設定パネルのタイトル行）に `data-tauri-drag-region="deep"` を付与し、マウスドラッグでウィンドウ移動を可能にする。

- `="deep"` 必須。値なし（bare）はヘッダー要素自身を直接クリックした場合のみドラッグ判定となり、子要素（アイコン・テキスト等）の上では発火しないため不可
- `input` / `button` などクリック可能要素は Tauri 側のロジックで自動的にドラッグ対象から除外されるため、サブツリー全体に付与しても入力・クリック操作は阻害されない
- 位置の永続化は行わない
- ドラッグには `core:window:allow-start-dragging` permission が必要（`capabilities/default.json` に追加済み）

<a id="resizing-and-size-persistence"></a>

### リサイズとサイズの永続化

**「位置は永続化せずサイズのみ永続化する」という方針とその理由**（意図的な非対称であり矛盾ではない）は、外部設計書 `external-design/04-platform-policies.md#window-position-vs-size` へ移設した。本節には実装上の対応のみを記す。

`resizable: true` でウィンドウ枠からのリサイズを許可する。`tauri.conf.json` の `width` / `height`（デフォルトサイズ）と `minWidth` / `minHeight`（最小サイズ）はいずれも 640 / 420 とする。

- **保存**：フロントエンドが `getCurrentWindow().onResized` イベントを購読し、リサイズ確定から 500ms デバウンスしたうえで `@tauri-apps/plugin-store` の JS API（frecency・クリップボード履歴と同じ `storeRef`／`settings.json`）へ `{ width, height }`（論理ピクセル。`scaleFactor()` で物理→論理に変換）を直接書き込む。Rust コマンドは追加しない。**保存先キーはリサイズ確定時点の実効ビュー（`viewRef.current`）によって`"windowSize"`（検索・設定・クリップボード履歴・最近使ったファイル・OCR共通）／`"favoriteEditWindowSize"`（お気に入り編集ビュー）／`"memoWindowSize"`（メモ管理画面）の3キーに分岐する**（`App.tsx`の`onResized`ハンドラ内）。お気に入り編集ビューが独立キーを持つのは軸4a時点からの意図的な設計判断で、検索/設定側のサイズと巻き添えで混ざらないようにするための布石（メモ画面がその後同じビューへ本文編集を追加した際に活きた）
- **復元**：`"windowSize"`（検索・設定ビュー等）はRust側の `setup()` で読み込み、存在すればメインウィンドウ生成直後に `window.set_size(LogicalSize::new(width, height))` を呼んで適用する（フロントエンドの描画・表示前に確定させるため、`show()` より前に行う）。キーが存在しない場合（初回起動等）は `tauri.conf.json` のデフォルトサイズ（640×420）のままにする。**`"memoWindowSize"`はこの起動時復元の対象外で、代わりにフロントエンド側（`App.tsx`の`memoEditOpen`変化を監視する`useEffect`）がメモ画面を開いた時点で`getCurrentWindow().setSize(...)`を直接呼んで適用する**（お気に入り編集ビューには対応する復元処理は無く、常に直近の`"windowSize"`のまま開く）
- 最小サイズの強制は `tauri.conf.json` の `minWidth` / `minHeight` に委譲する（Rust 側で個別にクランプ処理は行わない）

<a id="hotkey-registration"></a>

### グローバルホットキーの登録・変更

デフォルトは `Alt+Space`。アクセラレータ形式の文字列（`tauri_plugin_global_shortcut::Shortcut`（= `global_hotkey::HotKey`）の `FromStr` 実装が解釈できる形式。例: `Alt+Space`、`Ctrl+Shift+K`。Win キーは `Super`）として `settings.json` の `appSettings.hotkey` に永続化する。

- アプリ起動時（`setup`）に `appSettings.hotkey` を読み込み、`Shortcut::from_str` でパースして `register`。パース失敗時（設定破損等）はデフォルトにフォールバックし、ストアの値も補正して保存し直す
- `set_hotkey(accelerator)`（Rust コマンド）
  - `Shortcut::from_str` でパースし、失敗または修飾キー（`mods`）が空の場合はエラーを返して保存しない（修飾キー必須はフロントエンドだけでなく Rust 側でも検証する）
  - 現在登録中のショートカットを `unregister` → 新しいショートカットを `register`
  - 新ショートカットの `register` が失敗した場合（他アプリが使用中など）は旧ショートカットを `register` し直して維持し、エラーを返す（ストアは更新しない）
  - 成功時のみ `appSettings.hotkey` を更新して永続化する
  - `register`/`unregister` は `&str`（アクセラレータ文字列）を直接渡せる（`TryInto<ShortcutWrapper>` 経由）ため、`Shortcut` への変換とは別に文字列のまま登録・解除できる
  - グローバルショートカットの `with_handler` はどのショートカットが発火したかに関わらずメインウィンドウの表示/非表示をトグルするロジックなので、登録するショートカットを切り替えるだけで動作が追従する（ハンドラ自体の変更は不要）
- フロントエンドはキー入力を待ち受けず、修飾キー（Ctrl / Alt / Shift / Win）のチェックボックスと通常キーのプルダウンの組み合わせから直接アクセラレータ文字列を組み立てて `set_hotkey` を呼び出す。ライブキーキャプチャや `WM_SYSCOMMAND` 抑止のような仕組みは不要なため設けていない
- `set_hotkey` コマンドでホットキー変更が成功した直後、`app.tray_by_id("main-tray")` を取得して `set_tooltip(Some(...))` を呼び、新しいホットキー文字列でツールチップを即時更新する（トレイの詳細は [tray-autostart-updater.md](tray-autostart-updater.md) を参照）

## 経緯

このファイルの内容は現時点で仕様説明が中心で、大きな設計転換や却下案の記録は無い。今後、透過・角丸・サイズ永続化まわりで実装をやり直すような判断があった場合はここに追記する。

## 今後の指針

- ウィンドウの位置は今後も永続化しない。永続化するのはサイズのみ、という非対称な扱いを踏襲する
- 透過・角丸・shadow の3点セット（`backgroundColor` alpha 0／DOM側 `background: transparent`／`tauri.conf.json` の `shadow: false`）は個別に変更せず、常にセットで扱う。1つだけ変更すると角のアーティファクトが再発する
- 新しいドラッグ可能領域を追加する場合は必ず `data-tauri-drag-region="deep"` を使う（値なしの bare 指定は子要素で発火しないため避ける）
