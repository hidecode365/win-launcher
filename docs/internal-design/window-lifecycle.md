# ウィンドウのライフサイクル管理（表示・非表示・クローズ処理）

対象コード: `src/App.tsx`（`MainView` 型・フォーカス監視・`showSettingsRef`）、`src/hooks/useSearch.ts`（`closeWindow`・世代ID管理・フォーカス回復時再取得テーブル）、`src/lib/window.ts`（`hideWindow`）、`src-tauri/src/main.rs`（`window.center()`・`show()`・グローバルショートカットの表示/非表示トグル）。

横断アーキテクチャ系のファイル。ウィンドウを閉じる・フォーカスを失う・"/" プレフィックスモードへ切り替わるといった「表示状態の変化」に関わる設計は、機能ごとに個別実装せずすべてここに記載されたパターンへ乗せること。

## 現在の設計

<a id="main-view-enum"></a>

### 3枚の全画面ビューの状態管理（`MainView` 型）

`App.tsx` は「検索」「設定」「お気に入り編集」の3枚の全画面ビューを、単一の `type MainView = "search" | "settings" | "favoriteEdit"`（`useState<MainView>`）で管理する。いずれも同一の main ウィンドウ内での表示切り替えであり、新規のOSウィンドウは作らない。

**導入経緯**：お気に入り編集ビュー（段階3・軸4a）を追加する以前は、検索画面と設定画面の二択を単一の `boolean`（`showSettings`）で管理していた。3枚目のビューは `boolean` の二値では表現できないため、文字列リテラルの Union 型（enum 相当）へ変更した。

**既存分岐との後方互換**：`showSettings` という名前で `boolean` を直接参照する既存分岐が多数あったため（[focus-out-auto-hide](#focus-out-auto-hide) の `showSettingsRef` 等）、`view` の導入後も `const showSettings = view === "settings"` という派生値をそのまま残し、呼び出し側の書き換えを最小限にとどめた。同様に、お気に入り編集ビューかどうかの判定用に `favoriteEditOpen = view === "favoriteEdit"` も派生値として用意している。フォーカスアウト自動非表示の適用除外条件（[focus-out-auto-hide](#focus-out-auto-hide) 参照）も、旧来「`showSettings` のときだけ除外」だったものを「検索ビュー（`view === "search"`）以外では除外」という条件へ一般化した。

**今後の指針**：4枚目以降の全画面ビューを追加する場合は、`MainView` の Union 型へ新しい文字列リテラルを1つ追加するだけにすること。独立した `boolean` state（かつての `showSettings` のような形）を新設しない。3画面化のときに二値では表現しきれず enum 化した経緯を繰り返さないため。

<a id="focus-out-auto-hide"></a>

### フォーカスアウトで自動非表示

`getCurrentWindow().onFocusChanged` イベントで `hide()` を呼び、自動非表示を行う。

- WebView2 はウィンドウ内操作（設定パネルへの切替による DOM 入れ替え、ドラッグ開始など）でも一時的にフォーカス喪失を通知することがあるため、即時 `hide()` はしない
- フォーカス喪失通知後 150ms 待ち、`isFocused()` で再確認してなお非フォーカスの場合のみ `hide()` する（誤って隠れるのを防ぐデバウンス処理）
- **設定画面表示中はこの自動非表示を適用しない**（詳細は 00-requirements.md「キー操作」＞「フォーカスアウト時自動非表示の例外（設定画面表示中）」節を参照）。フォーカス喪失の検知・`hide()` の呼び出しはいずれも Rust 側を経由せず `App.tsx` の `onFocusChanged` 内で完結しているため、Rust 側に状態を持たせたり IPC でフラグを同期したりする必要はなく、フロントエンドの `showSettings` state を判定に使うだけで完結する
  - `App.tsx` のフォーカス監視 `useEffect` は依存配列が空（マウント時に一度だけ登録）のため、`showSettings` state を直接クロージャで参照すると初回値（`false`）に固定されてしまう。これを避けるため、毎レンダーで最新の `showSettings` を書き込む `showSettingsRef`（`useRef`）を用意し、150ms のデバウンス後に `hide()` を呼ぶかどうかの判定（`if (stillFocused || showSettingsRef.current) return;`）はこの ref を参照する
  - 設定画面の開閉は `openSettings`/`closeSettings`（いずれも単一の `showSettings` state を更新するだけ）に一本化されており、呼び出し元（歯車アイコンクリック・`Ctrl+S`・`Esc`・設定パネル自身の閉じるボタン）が複数あってもすべてこの2関数を経由する。そのため `showSettingsRef` を見るだけで全ての開閉経路に自動的に追従し、経路ごとに個別のフラグリセット処理を書く必要がない
  - 設定画面を閉じた直後の最初のフォーカスアウトから、通常のフェードアウト・非表示挙動に戻る（`closeSettings` 実行時点で `showSettings` が `false` に更新され、次のレンダーで `showSettingsRef.current` も追従するため、追加のリセット処理は不要）
- グローバルホットキー（Alt+Space）は Rust 側の「表示中なら非表示、非表示中なら表示」というトグル判定（`main.rs` の `with_handler`、`window.is_visible()` のみを見る）のままで変更していない。設定画面表示中にホットキーを押すと、フォーカスの有無に関わらず「表示中」なので非表示になる（設定画面の状態は保持され、再度ホットキーを押すと同じ設定画面の状態のまま復帰する）
- フォーカスイン時（グローバルホットキー等での再表示時）は検索欄の内容を保持したまま再フォーカスする
- 位置の永続化は行わない。`tauri.conf.json` の `center: true` により再起動時は常に画面中央へ戻る（ウィンドウを表示するすべての箇所——グローバルホットキー / トレイ「Show」/ トレイアイコンクリック——で `show()` 直前に Rust 側から `window.center()` を呼び出す）

<a id="close-window-common-design"></a>

### ウィンドウを閉じる系アクションの共通設計

ウィンドウを閉じる系のアクション——`launchFile`／`openContainingFolder`／`copyResult`／`copyUrlConvertResult`／`openWebSearch`／`confirmSystemCommand`／`addSearchFolderFromPaste`／`confirmShortcut`（以上 `useSearch.ts`）／`selectClipboardEntry`（`useClipboard.ts`。`useSearch` の `closeWindow` を引数として受け取って使う）——は、すべて `useSearch.ts` の `closeWindow(options?)` を経由する。**新しくウィンドウを閉じる系アクションを追加する場合も、必ずこの関数を経由すること。** `closeWindow()` を経由しない独自のクローズ処理・個別の `useRef` ガードを新設しない。

設計原則：`hideWindow()` を最優先で `await` し、React state の変更は解決後に行う。

```ts
const closeWindow = useCallback(
  async (options?: {
    clearQuery?: "full" | "prefixOnly";
    prefix?: string;
    cleanup?: () => void | Promise<void>;
  }) => {
    await hideWindow();
    if ((options?.clearQuery ?? "full") === "prefixOnly") {
      setQuery(options?.prefix ?? "");
    } else {
      setQuery("");
    }
    bumpCloseRefreshTick();
    await options?.cleanup?.();
  },
  [bumpCloseRefreshTick]
);
```

- `results`／`selected`／`calcResult`／`frecency` 等、画面に影響する React state の変更は、必ず `cleanup` オプション（または `closeWindow()` 自身が行うクエリのクリア）としてまとめ、`hideWindow()` の解決後にのみ実行されるようにする。この境界さえ守れば、後処理がどれだけ重かったり（frecency の store 書き込み等）、他の `useEffect` を連鎖的に再実行させたり（`/recent` の `recentResults` 再計算等）しても、ウィンドウが可視状態のまま中間状態が描画されることは構造的に起こり得ない
- 各アクションが行う「ファイル起動・クリップボードへの書き込み等の Rust 呼び出し（アクション本体）」は、`closeWindow()` を呼ぶ前に `await` せず fire-and-forget で発火する。ウィンドウの表示状態と無関係な副作用のため `hideWindow()` を待たせる理由がなく、開いたアプリの起動が遅い場合（画像ビューアー等）でも `closeWindow()` の `hideWindow()` 呼び出し自体は遅延しない
- `bumpCloseRefreshTick()` は `closeRefreshTick`（`useState<number>`）を加算し、メインの検索 `useEffect` の依存配列に含めている。React の `useState` は新しい値が `Object.is` で現在値と等しければ再レンダリングをスキップする（ベイルアウト）ため、無入力のまま（`query` が既に `""`）frecency 順のデフォルト一覧から直接ファイルを起動した場合や、`/recent`・`/cb` で連続してプレフィックスのみへ戻す場合、`setQuery` だけでは値が変化せず検索エフェクトが再実行されないことがある。`closeRefreshTick` は query の値に依存せず確実にエフェクトを再実行させるための専用カウンタ
- **`clearQuery` の使い分け（"full" / "prefixOnly"）**：`"full"`（デフォルト。クエリを完全に空文字へ戻す）と `"prefixOnly"`（プレフィックス部分だけを残し、それに続く絞り込みフィルタ文字列だけをクリアする。残す文字列は呼び出し側が `options.prefix` に渡す）の2パターン。`"prefixOnly"` を使うのは `launchFile` の `/recent` モード分岐と `selectClipboardEntry`（`/cb`）の2箇所のみで、それ以外は明示的に指定しない限り `"full"` のまま動作する
  - **新規プレフィックスモード追加時の検討観点**：確定（Enter／クリック）のたびにそのモードから連続して別の項目を選び直すユースケースが想定されるモード（`/recent`・`/cb` のような一覧選択系）は `"prefixOnly"` の対象候補にする。逆に、1回の確定でそのモード自体から離脱するのが自然なモード（通常のファイル検索、システムコマンドの実行等）は `"full"` のままでよい。`options.prefix` に渡す文字列は、設定画面で変更可能な呼び出しキーワードを反映した動的な値（`PREFIX_CHAR + appSettings.xxxKeyword` 等）として都度組み立てること。`"/recent"`・`"/cb"` のようなハードコードはしない（ユーザーがキーワードを変更している場合に不整合が生じるため）

**再表示時（`cleanup` がまだ完了していない場合）の挙動方針**：`closeWindow()` の `cleanup` は `hideWindow()` の解決後に開始される。理論上、ユーザーが極めて素早く再度ウィンドウを表示した場合、`cleanup` の非同期部分（`recordFrecency` の store 書き込み、`search_files`/`get_recent_files` の再取得等）が完了していない状態で画面が見える可能性がある。採用した方針は「再表示時は一旦ニュートラルな状態を先に描画し、`cleanup` の結果は次のクエリ変化まで気にしない」（検討した他の2方針との比較は「経緯」節を参照）。

**適用対象外の例外**：OCR プレビューの「コピーして閉じる」（`App.tsx` の `handleOcrCopyAndClose`）は、`closeWindow()` を経由せず独自に 180ms のフェードアウト演出を挟んでから `hideWindow()` を呼ぶ（詳細は [clipboard-and-ocr.md](clipboard-and-ocr.md) を参照）。これはウィンドウが可視のまま意図的に見せる演出であり、「隠れるまで state を変更しない」という本節の原則とは目的が異なる。同様に `Escape` キーによる非表示は `hideWindow()` を直接呼ぶのみで、クエリ保持のため `closeWindow()` の後処理（クエリクリア）自体を意図的に行わない。

<a id="modal-keydown-window-level"></a>

### モーダル・ダイアログのキー操作の実装

**原則そのもの**（キャンセル（Escape）はフォーカス位置に依存させず window レベルへ一本化し、確定（Enter）はブラウザ標準のフォーカス経路に委ねて独自の Enter 分岐を設けない、という非対称な扱い）は、外部設計書 `external-design/01-screen-transitions.md#modal-key-policy` へ移設した。本節には実装パターンのみを記す。

**Escape（キャンセル）の実装**：`SystemCommandModal`（システムコマンド確認）・`RegisterEntryDialog`（お気に入り登録ダイアログ）・`FavoriteFolderDeleteModal`（フォルダ削除確認）・`PathPasteWizard`（パス貼り付けウィザード）など、検索ビュー上に開閉するモーダル・ダイアログ・ウィザードの Escape は、`App.tsx` の window レベルの共通 `keydown` リスナー（[ウィンドウを閉じる系アクションの共通設計](#close-window-common-design) 節と同じ `useEffect`）で処理する。個別コンポーネントのローカル `onKeyDown` によるフォーカス依存の判定を新設しない。

フォーカス位置に依存させられない具体的な事情：モーダルを開くトリガー要素（★ボタン・ゴミ箱アイコン等の `<button>`）はクリック直後もそれ自身がフォーカスを持ち続けることがある。ダイアログ自身のマウント時 `focus()`（`requestAnimationFrame` 越しでも）が間に合わない、あるいは一覧行のルート要素が実在の `<button>` だった場合はクリックで選択した行自身にフォーカスが残り続ける（詳細は [result-list-and-selection.md](result-list-and-selection.md#row-focus-retention-bug) を参照）。これらの事情により、意図した要素にフォーカスが無い瞬間に Escape が押されると、フォーカス依存のローカル `onKeyDown` では拾えずキャンセルできなくなる（詳細は「経緯」節の [modal-keydown-focus-incidents](#modal-keydown-focus-incidents) を参照）。

**Enter（確定）の実装**：window レベルリスナーに Enter 分岐を書かない。Tab でフォーカスを移動し、フォーカスされたボタン上で Enter を押すと `click` が発火する、というブラウザ既定の挙動をそのまま使う。`FavoriteFolderDeleteModal` がこのパターンの参照実装。

- **例外1**：`RegisterEntryDialog` の Enter は、表示名・保存先フォルダ等のダイアログ内部 state を必要とするため、ダイアログ自身の `onKeyDown` で処理する（window レベルではなく、かつ `stopPropagation` する）
- **例外2**：`PathPasteWizard` の Enter は、ステップ遷移という「ボタンの click では表現されない操作」のため window レベルで処理する
- **是正済み**：`SystemCommandModal` はかつて window レベルに独自の Enter 分岐と 300ms の猶予期間（`SYSTEM_COMMAND_CONFIRM_GRACE_MS`）を持っていたが、外部設計書の`external-design/01-screen-transitions.md#system-command-enter-removal`に従いいずれも削除済み。現在は `deleteFolder` と同じくブラウザ標準のフォーカス経路のみに統一されている

<a id="search-overlay-active-consolidation"></a>

**window レベルリスナーが対象とするオーバーレイstateの一覧化（`searchOverlayActive`）**：対象は `favoriteDialogTarget`（登録ダイアログ）／`pendingCommand`（システムコマンド確認）／`pendingDeleteFavoriteFolder`（フォルダ削除確認）／`pathPasteWizardMode`（パス貼り付けウィザード）の4state。**このうち `pendingDeleteFavoriteFolder` は、`/favorite` ブラウジング側の暫定削除UI撤去後は検索ビューでは非 `null` にならない**（[前述の再フォーカス範囲の節](#modal-keydown-window-level)を参照）ため、「`SearchBox` を隠す/`disabled`（実装上は `readOnly`。後述）にする検索ビュー内オーバーレイ」という他3stateと共通の性質を厳密には持たない。当初4stateがこの性質を共有していた前提で `searchOverlayActive` へまとめて集約した経緯があり、`pendingDeleteFavoriteFolder` の配列上の残置自体に実害は無いが、この非対称性は認識しておくこと。この「4state」という列挙は以下の3箇所に独立して存在していた：

1. `App.tsx` の検索ボックス再フォーカス `useEffect` の条件・依存配列
2. `App.tsx` から `SearchBox` へ渡す `disabled` prop の算出式
3. `handleKeyDown`（`SearchBox` の React `onKeyDown`）の早期 `return` ガード

3箇所とも「4stateのうちどれか1つでも開いているか」という同じ問い（"is any overlay open"）にしか答えておらず、個別の overlay ごとに異なる分岐は不要だった。そこで `useSearch.ts` 側に `searchOverlayActive`（4stateを配列にまとめ `.some(Boolean)` で判定する派生値）を1箇所だけ定義し、上記3箇所はこれを参照するだけにした。新しいオーバーレイstateを追加する場合も、`useSearch.ts` の `searchOverlayActive` の配列へ1state追記するだけで、上記3箇所は自動的に追従する（コンパイルエラーで強制するものではなく、あくまで「参照先を1箇所に集約する」ことによる更新漏れリスクの低減である点に注意。詳細は「今後の指針」節を参照）。

- `SearchBox` 自身の React `onKeyDown`（`handleKeyDown`）は、`searchOverlayActive` が立っている間は早期 `return` するだけに留め、実処理を持たせない（window レベルとの二重ハンドラ化を防ぐため）
- window レベルの共通 `keydown` リスナー自体は、オーバーレイごとに Escape の対応が異なりうる（`stopPropagation` の有無等）ため、`searchOverlayActive` という単一値には集約できず、引き続き4state個別の分岐を持つ。**Enter はいずれのオーバーレイも window レベルでは処理しない**（[modal-keydown-window-level](#modal-keydown-window-level)節の「Enter（確定）の実装」を参照）
- 例外：インライン編集用の通常のテキスト入力欄（お気に入り編集ビューのフォルダ作成／リネーム欄など）は、フォーカスが外れる余地がないため、ローカル `onKeyDown` ＋ `stopPropagation` のパターンのままでよい
- 新しい同種のモーダル・ダイアログを追加する場合は、`searchOverlayActive` の配列への追記1箇所と、window レベルリスナーの分岐・依存配列への追記1箇所の、計2箇所を変更するだけでよい

**`view` をまたいで共有される overlay state（`pendingDeleteFavoriteFolder`）の再フォーカス範囲**：`pendingDeleteFavoriteFolder`（フォルダ削除確認）は `useSearch.ts` 側の state で、型・保持場所は特定の `view` に縛られていない。**この不具合の発生当時（400_テスト・バグ修正）は検索ビュー（`view === "search"`、`/favorite` ブラウジングの暫定UI）とお気に入り編集ビューの両方から開かれる経路が存在したが、`/favorite` ブラウジング側の暫定削除UI・それに対応する `App.tsx` 側の描画／window レベル keydown 分岐はいずれも撤去済みで、現在は「お気に入り編集ビュー（`view === "favoriteEdit"`、`FavoriteEditView.tsx`）からのみ開かれうる」という制約が成り立つ**（呼び出し元を辿った調査で両方向とも確認済み。`favoriteEditOpen` が `false` の間に `pendingDeleteFavoriteFolder` が非 `null` になる経路は存在しない）。一方、`App.tsx` の `searchOverlayActive` を参照する検索ボックス再フォーカス `useEffect` は `view === "search"` を条件に含んでおり、意図的に検索ビュー専用である（`SearchBox` の `inputRef` は検索ビューにしか存在しないため）。

400_テスト・バグ修正：この非対称性を見落とし、お気に入り編集ビュー側では「削除確認モーダルを閉じても何にも再フォーカスされない」不具合があった（`FavoriteEditView.tsx` 自身の絞り込み欄フォーカスeffectが、コンポーネントのマウント時（空の依存配列）にしか実行されておらず、`pendingDeleteFolder` の変化を見ていなかったため）。当時はまだ検索ビュー側の暫定削除UIが存在しており、両ビューから開かれる前提での対応だった。

対応方針：`App.tsx` 側の `searchOverlayActive` エフェクトを `view === "favoriteEdit"` にも対応させる（＝ビューをまたいだ1つの巨大なeffectにする）のではなく、**各ビューが自分自身のデフォルトフォーカス対象（検索ビューなら `inputRef`、編集ビューなら `filterInputRef`）を自分自身の責務として管理する**という既存の分離（`FavoriteEditView.tsx` が独自にマウント時フォーカスeffectを持っていたのと同じ設計）を維持したまま、`FavoriteEditView.tsx` 側のeffectの依存配列に `pendingDeleteFolder` を追加した。あわせて横並び調査の結果、同じビュー内でリネーム中（`renamingNodeId`）・フォルダ作成中（`creatingFolderAnchorKey`）のインライン入力欄も同じ抜け（確定/キャンセル後に絞り込み欄へ戻らない）を持っていたため、3state共通の条件へまとめて対応した（`FavoriteEditView.tsx` 内のコメントを参照）。`useSearch.ts` の `searchOverlayActive` 自体（検索ビュー用）は変更していない。

<a id="prefix-mode-architecture"></a>

### "/" プレフィックスモードの内部アーキテクチャ

`/recent`・`/cb` 等、"/" プレフィックスを持つモードが増えるたびに個別対応が積み重なり、フォーカス・非表示まわりのロジックが複雑化していた。以下の2パターンに集約することでこれを解消している。**新しい "/" プレフィックスモード（pull型のデータ取得を伴うもの）を追加する際は、必ずこの2パターンに乗せること。** 個別の ref・個別の `useEffect` 分岐を新設しない。

- **世代ID管理（`asyncCallIdRef`、`useSearch.ts`）**：`search_files`・`get_recent_files` 等、非同期呼び出しの「自分が最新の呼び出しか」を判定する世代 ID を、モード名をキーにした単一の `Record<string, number>` にまとめている（`const asyncCallIdRef = useRef<Record<string, number>>({})`）。呼び出し直前に `beginAsyncCall(key)` で世代を進めて ID を取得し、`.then()` 側で `isLatestAsyncCall(key, id)` が `false` なら結果を破棄する。現在使用中のキーは `"search"`（`search_files`）と `"recent"`（`get_recent_files`）
- **フォーカス回復時再取得テーブル（`focusRegainTableRef`、`useSearch.ts`）**：push型（OS 通知等で非表示中も自動的に最新化される。例：クリップボード履歴）ではない pull型モードは、モード遷移時の1回きりの取得のままだと非表示中の変化（ファイルを開く／削除する等）が反映されない。これに対応するため、`focusRegainTableRef.current`（`Record<string, { active: boolean; refetch: () => void }>`）へレンダーのたびに最新の `active`／`refetch` を書き込み、単一の `onFocusChanged` リスナーがフォーカス回復時にテーブルを走査して `active` なモードだけ `refetch()` を呼ぶ。リスナー自体は特定モードを知らない汎用ロジックのみを持つ
  - 現在のエントリは `recent` の1つ（`/recent` モード、`fetchRecentFiles("focus-regain")`）。新しい pull型モードを追加する場合は、この `focusRegainTableRef.current` の代入にエントリを1つ追加するだけでよく、`onFocusChanged` リスナー自体やモード専用の鏡ref（かつての `recentModeRef` のようなもの）を新設する必要はない
  - この `onFocusChanged` リスナーは `App.tsx` 側のフォーカスアウト自動非表示・フォーカスイン再フォーカス用のリスナー（[focus-out-auto-hide](#focus-out-auto-hide) 参照）とは別に `useSearch.ts` 内で独立して登録している。責務（ウィンドウ全体のフォーカス管理 vs. モードごとのデータ鮮度管理）が明確に分かれているため、意図的に統合していない

## 経緯

<a id="generation-id-shared-counter-incident"></a>

### 世代IDを1本のカウンタで共有していた頃の不具合

`search_files` と `get_recent_files` の世代 ID をかつて1本のカウンタで共有していたところ、「Shift+Enter でフォルダを開く → Explorer にフォーカスを奪われる → `/recent` モードのフォーカス回復リスナーが `get_recent_files` を呼んで共有カウンタを進める → 直後に解決した `search_files("")` の再取得が『もう自分は最新ではない』と誤判定され結果が握りつぶされる」という不具合が起きていた。**同一のカウンタを複数の非同期呼び出し系統（別コマンド）で共有しないこと**が教訓であり、それを構造的に強制するのが現在の「モード名をキーにした `Record`」という仕組みである。

<a id="close-window-history"></a>

### `closeWindow()` に統一するまでの「モグラ叩き」

以前は各アクションが「アクション本体の副作用 → 結果クリア → `closeWindow()`」という順序を個別に実装しており、`hideWindow()` が解決する前に他の非同期処理（`recordFrecency` の `setFrecency` が引き起こす検索 `useEffect` の再実行、`/recent` の `recentResults` の同期的な再計算等）が先に走ってしまい、選択ハイライトの位置や結果一覧の内容が一瞬だけ意図しない状態で描画される「ちらつき」バグが、症状ごとに個別発生していた（通常のファイル検索での frecency 起因のちらつき、`/recent` で画像ファイルを実行した場合のみ再発したちらつき、等）。それぞれを `closingRef` のような個別ガードで後追いに潰す対症療法を重ねていたが、ファイル種別や処理の重さが変わるたびに新しい中間状態が露出しかねない構造だった。「`hideWindow()` 解決より前に、画面に影響する React state を一切変更しない」という順序を `closeWindow()` 自身に強制させる設計に統一したことで、個別ガード（`closingRef`）や個別の呼び出し順序の工夫（`recordFrecency` を意図的に `await` せず発火する等）はすべて不要になり削除した。

<a id="reopen-during-cleanup-tradeoff"></a>

### 再表示時に `cleanup` が未完了だった場合の3方針比較

検討した3方針：

1. 再表示時、`cleanup` の完了を待ってから最新状態を描画する
2. 再表示時点で未完了なら、その場で `cleanup` を即時実行してから描画する
3. 再表示時は一旦ニュートラルな状態を先に描画し、`cleanup` の結果は次のクエリ変化まで気にしない

採用したのは **3**。理由：

- ウィンドウの再表示（グローバルホットキー／トレイ）は Rust 側が `window.center()` → `show()` を行うだけの経路で、JS 側の `cleanup` の完了と同期する仕組みを持たない。1・2 を実現するには新たな IPC 往復や `show()` 自体の待機処理が必要になり、体感速度（Alt+Space の反応速度）を犠牲にしてまで解消する価値のある問題ではない
- `cleanup` の同期的な部分（`setQuery`／`setResults`／`bumpCloseRefreshTick` 等）は `hideWindow()` の解決直後、単一の JS 実行区間内でほぼ瞬時に完了する。人間の Alt+Space 打鍵と Rust 側の `show()` の IPC 往復がここに割り込む余地は事実上ない
- 残る非同期部分（`recordFrecency` の store 書き込み、検索結果の再取得等）が再表示後もまだ解決していない場合に見える状態は、「クエリを変更した直後、結果が追いつくまでの一瞬のロード状態」と本質的に同じであり、通常のクエリ入力時から既に許容されている自然な UI 状態である。ここだけを特別扱いして待たせる理由がない

<a id="modal-keydown-focus-incidents"></a>

### RegisterEntryDialog・SystemCommandModal でのフォーカス依存キー操作不具合

- **症状**：①お気に入り登録ダイアログ（`RegisterEntryDialog`）を★ボタンから開いた直後、Escapeを押してもダイアログが閉じないことがあった。②システムコマンド確認モーダル（`SystemCommandModal`）表示中、Enter/Escapeを押しても確定・キャンセルできないことがあった
- **直接原因**：①トリガーの★ボタンがクリック後もフォーカスを持ち続け、ダイアログ自身のマウント時 `focus()` が間に合わない場合、フォーカスがダイアログ内のどの要素にも当たらないまま Escape を押しても、ダイアログ自身の `onKeyDown`（React合成イベント）まで到達しない。②当時は「モーダル表示中は `SearchBox` 自体が `disabled` になり強制的に `blur` される」ことを原因と推定して対応した。**この推定は不正確だった**（`SearchBox` の `disabled` prop は実装上 `<input readOnly>` にマッピングされており、`readOnly` はフォーカス・blur に影響しない）。後日の再調査（[row-focus-retention-bug](result-list-and-selection.md#row-focus-retention-bug) 参照）で判明した真の原因は、システムコマンド候補行の DOM 構造にあった：候補行のルート要素が実在の `<button>` だったため、マウスクリックで選択した瞬間にその `<button>` へDOMフォーカスが移り、`SystemCommandModal` は一覧をアンマウントしないオーバーレイのため、フォーカスはクリックされた行の `<button>` に残り続ける。この状態で押すEnterは `SearchBox`（`<input>`）とは別要素が発端のため、`<input>` に束縛された `handleKeyDown`（React合成イベント）を経由しない。**結果的に「window レベルリスナーへ一本化する」という対応自体は結果的に正しかった**（フォーカス位置に依存しない設計にしたため、原因の特定が後から変わっても対応を変更せずに済んだ）が、原因分析の記録としては訂正しておく
- **横並び調査の結果**：検索ビュー上に開くオーバーレイ4種（登録ダイアログ・システムコマンド確認・フォルダ削除確認・パス貼り付けウィザード）のうち、フォルダ削除確認モーダル・パス貼り付けウィザードは既に window レベルリスナーで確定/キャンセルを処理する設計になっており対象外だった。登録ダイアログとシステムコマンド確認の2件が、ローカル `onKeyDown`・`SearchBox` の `onKeyDown` というフォーカス依存の実装のまま残っていたことが判明した
- **原因の性質判定**：「モーダルを開くトリガーがクリック後もフォーカスを持ち続けうる」「モーダル表示中に元のフォーカス先が disabled/blur されうる」というのは特定のダイアログ固有の実装ミスではなく、フォーカス依存でキー操作を処理するモーダル実装パターン全般が共有する構造的な弱さと判定した。個別対応ではなく、既に一部（フォルダ削除確認・パス貼り付けウィザード）で採用していた「windowレベルリスナーへの一本化」を全4種に統一する設計見直しを行った（[modal-keydown-window-level](#modal-keydown-window-level)節）
- **対応**：登録ダイアログはEscapeのみwindowレベルリスナーへ保険として追加（Enterは表示名・保存先フォルダ等ダイアログ内部stateが必要なため引き続きダイアログ自身が処理）。システムコマンド確認はEnter/Escapeともwindowレベルリスナーへ完全移管し、`SearchBox`側の実処理は削除した
- **その後の訂正**：上記「Enterもwindowレベルへ完全移管」した設計が、キーのチャタリング／WebView2の入力二重発火により確認を経ず即実行される事故を招いたため、Enterは window レベルの分岐を撤去しブラウザ標準のフォーカス経路へ戻した（[modal-keydown-window-level](#modal-keydown-window-level)節「Enter（確定）の実装」・外部設計書 `external-design/01-screen-transitions.md#modal-key-policy-history` を参照）。Escapeの一本化は維持している

<a id="suppress-next-search-ref-removed"></a>

### `suppressNextSearchRef` の廃止

ファイル起動やコピー等でウィンドウを閉じる直前の `setQuery("")` による空クエリへの変化でも、`fileSearchEnabled` が `true` なら通常通り `search_files("")` を呼ぶ（抑止しない）。この呼び出しは `hideWindow()` でウィンドウが非表示になった後（ユーザーからは見えない状態）に解決するため体感上のコストはなく、代わりに次に空クエリのまま再表示した際、常に最新の frecency 順一覧（通常表示）が即座に見える状態になる。

かつてはこの空クエリへの変化を「ウィンドウを閉じるだけなら不要な処理」として `suppressNextSearchRef` で1回分だけ抑止していたが、抑止した分を再取得するタイミングがどこにも存在せず、次にウィンドウを再表示した時に検索結果エリアが空のまま固まって見える不具合（クエリを何か入力するまで復旧しない）を引き起こしていたため、このフラグ自体を廃止した。

## 今後の指針

- 新しいウィンドウクローズ系アクションは必ず `closeWindow()` を経由させる。独自のクローズ処理・個別の `useRef` ガードを新設しない
- 画面に影響する React state の変更は `hideWindow()` の解決後（`cleanup` オプション内）にのみ行う。この順序さえ守れば、後処理の重さや連鎖的な再レンダリングを個別に気にする必要はない
- 新しい "/" プレフィックスモード（pull型のデータ取得を伴うもの）を追加する場合、世代ID管理は `asyncCallIdRef` に新しいキーを割り当てるだけにし、既存キー（`"search"`/`"recent"`）を使い回さない。フォーカス回復時の再取得が必要なら `focusRegainTableRef.current` にエントリを1つ追加するだけで済ませ、`onFocusChanged` リスナー自体やモード専用の鏡refを新設しない
- モーダル・ダイアログ（`SystemCommandModal`／`RegisterEntryDialog`／`FavoriteFolderDeleteModal`／`PathPasteWizard` 等）のキー操作は、外部設計書 `external-design/01-screen-transitions.md#modal-key-policy` の非対称原則に従う：Escapeのみ DOM上のフォーカス位置に依存させず window レベルの共通 keydown リスナーへ一本化し、Enterはブラウザ標準のフォーカス経路（Tab で移動したボタン上の Enter）に委ねて window レベルに独自分岐を設けない
- 「検索ビュー上のオーバーレイが1つでも開いているか」だけを見ればよい箇所（検索ボックス再フォーカス・`SearchBox` の `disabled` 判定・`handleKeyDown` の早期return）は、オーバーレイstateを個別に列挙せず `useSearch.ts` の `searchOverlayActive`（[search-overlay-active-consolidation](#search-overlay-active-consolidation)）を参照する。新しいオーバーレイstateを追加する場合はこの1箇所の配列へ追記するだけでよい。ただしオーバーレイごとにEnter/Escapeの意味が異なる window レベルリスナー自体は個別分岐が必要で、この値には集約できない
- 「1回だけ抑止する」フラグ（`suppressNextSearchRef` のようなもの）を安易に新設しない。抑止した処理を後から再取得するタイミングが存在するかを必ず検討すること。存在しない場合、抑止は「気づかれないまま固まって見える」不具合の温床になる
