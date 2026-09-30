# 画面切替の枠内演出（パール・フェード）

対象コード: `src/lib/screenTransition.ts`（判定・時間・経路・リサイズ照合の純粋ロジック）、`src/lib/screenTransitionPainter.ts`（Canvas描画）、`src/lib/screenTransitionController.ts`（制御。共有インスタンス `screenTransition`）、`src/components/ScreenTransitionLayer.tsx`（描画面）、`src/App.tsx`（`App`／`AppMain`の分割・利用者復帰の識別子・`onResized`・メモ画面の`setSize`）、`src/lib/window.ts`（`hideWindow`）、`src/styles.css`／`tailwind.config.js`（演出色）、`tools/screen-transition.test.mjs`（自動テスト）。

通常検索と、お気に入り・メモ・クリップボード履歴・最近使ったファイルの4画面の間の実画面切替で、ウィンドウ枠の内側を光らせる装飾。**対象遷移・時間・形状・光量・設定の仕様は要件 `05-settings-and-system.md`「画面切替アニメーション」、設計方針は外部設計 `01-screen-transitions.md`「対象画面切替の枠内演出」が正本**であり、本書は「どう作られているか」だけを記す。演出は画面遷移・入力・選択・フォーカスから独立した装飾で、どれも待たせない。

## 現在の設計

<a id="shared-layer-placement"></a>

### 共有レイヤーの配置

`App.tsx` は、従来の全処理を `AppMain` に置き、`export default function App()` は `<AppMain />` と `<ScreenTransitionLayer />` を並べるだけの薄いラッパーにしている。`AppMain` は設定・お気に入り・メモ・クリップボード履歴・最近使ったファイル・OCR・検索の7画面を個別の早期returnで描くため、レイヤーを各returnに書くと画面切替のたびにアンマウント・再マウントされ、切替をまたぐ中断・再開始が成立しない。早期returnの外側（`AppMain` の兄弟）に1つだけ置くことで再マウントを避けている（早期returnを内部関数化して字下げを変えるより差分が小さい）。

永続させるのは制御側（`ScreenTransitionController` のインスタンス）で、Canvas要素は再生中だけ `ScreenTransitionLayer` が載せ、終了・中断時に取り除く（透過ウィンドウで全面レイヤーを常時合成しない）。`canvas` は `pointer-events:none`・`aria-hidden`・フォーカス不可・`fixed inset-0 z-40`。各画面ルートは `backdrop-blur-xl`＋`overflow-hidden` で独立した重ね合わせコンテキストを作り、モーダル（`z-10`）はその内側にあるため、外側のレイヤーは「モーダルより下」を選べない。モーダルとは視覚的に重なり得るが、操作・フォーカス・アクセシビリティは妨げない（PO判断）。

<a id="transition-decision"></a>

### 開始の判定（実効ビューの遷移ペア＋利用者復帰の識別子）

`AppMain` は毎コミット（依存配列なしの `useEffect`）で、表示上の**実効ビュー**（`viewRef.current`。レンダー中に導出される `favoriteEditOpen` 等の派生値で決まり、commit済みの `view` より1レンダー先行する）と、利用者復帰の識別子 `userReturnToken` を `screenTransition.update` へ渡す。commit済みの `view` を渡すと、実効ビューが切り替わった次のレンダーで `view` が追いつくときに二重発火するため使わない。`shouldStartTransition`（`screenTransition.ts`）が直前と今回のスナップショットを比べ、次のときだけ開始する。

- 往路（検索→対象4画面）：実効ビューの差分のみ。キーワード入力・候補選択・貼り付けのどの経路でも、実効ビューが切り替わった1回だけ。キーワードの文字列は見ないため、設定でキーワードを変えても対象になる
- 復路（対象4画面→検索）：差分に加え、**識別子が前回より新しいこと**
- OCR・設定との往復、4画面間、初回（前回値なし）、同一画面は対象外

`userReturnToken` は `AppMain` の `useState`。利用者操作の入口である `closeMemoEdit`／`closeClipboardEdit`／`closeRecentEdit`／`closeFavoriteEdit`（Escape・空欄Backspace・戻るボタンの共通の入口）だけが `markUserReturn()` を呼び、`setView("search")` と同じイベントハンドラ内（同じバッチ）で増やす。確定クローズ用の `resetToSearchView`（`closeWindow` のcleanup内で、`hideWindow()` の解決後に呼ばれる）は増やさない。これにより「非表示中の内部的な検索復帰」を、可視状態の判定やタイミングに依存せず、原因によって構造的に除外できる。

識別子は「抑止」ではなく「許可」側であり、欠落しても演出が出ないだけで画面は壊れない（[window-lifecycle.md](window-lifecycle.md#suppress-next-search-ref-removed) の「1回だけ抑止するフラグを新設しない」と性質が異なる）。実効ビューが変わらなかった呼び出しで識別子だけが増えても、コントローラが毎コミットで前回値を更新するため、後の確定クローズ由来の反転へ持ち越されない。**新しく「利用者操作で4画面から検索へ戻る」入口を追加する場合は、その入口から `markUserReturn()` を呼ぶこと。呼ばないと演出が出ない。**

<a id="cancel-and-restart"></a>

### 中断・連続切替・開始待ち

`ScreenTransitionController` は次のとおり動く。

- 連続切替：`start()` が前のrAF予約を取り消して最初から再生する
- OFF：`update()` で `enabled=false` を受けたら `cancel()`。OFF中は開始しない（判定に用いる前回値は更新し続ける）。画面切替の枠演出専用の設定で、他の演出へ適用しない
- 非表示：`hideWindow()`（`src/lib/window.ts`）の冒頭で、`await` の前に `screenTransition.cancel()` を呼ぶ。再生中のrAFに加え、**Canvas取り付け待ち・最初のフレーム待ちの開始待ち予約も同期的に取り消す**ため、再表示で続きが出ない。Rust側に `.hide()` の呼び出しはなく、非表示は必ず `hideWindow()` を通る
- 起点：Canvasが取り付いた後の最初の `requestAnimationFrame` のタイムスタンプ。以降は時間基準（位相は `phaseAt(elapsed)`）で進めるため、新画面のマウントでフレームが落ちても合計821msは保たれる（落ちたフレームは飛ぶ）
- 描画例外は `console.error` に残して `cancel()`（画面全体は落とさない。`ErrorBoundary` は迂回しない）
- 可視フラグは持たない。`onFocusChanged(true)`（`show()` 後のfocus通知）にも依存しない

<a id="resize-verification"></a>

### リサイズの発生元の照合

`onResized` はユーザーの枠ドラッグとアプリ主導の `setSize` を区別しない。アプリ主導のサイズ変更（現状はメモ画面を開いたときの保存済み `memoWindowSize` の適用）では、`setSize` の直前に `screenTransition.expectProgrammaticResize(width, height)` で目標の論理サイズと期限（1.5秒）を登録する。`onResized` 側は物理サイズを `scaleFactor` で論理サイズに換算し（非同期）、`screenTransition.handleResize` へ渡す。`classifyResize` は次の3つに分類する。

- `unchanged`：直前の基準の論理サイズと許容誤差（2px）以内。DPI変化だけで物理サイズが変わった場合を含み、中断しない
- `programmatic`：期限内で目標サイズと許容誤差以内。中断せず、基準サイズを更新する
- `user`：それ以外。演出を消す

基準サイズは `programmatic` のときだけ更新する（「変化なし」のたびに更新すると、ゆっくりしたドラッグの1イベントあたりの差が許容誤差内に収まり続け、検出できなくなる）。同サイズの `setSize` では `onResized` が発火しないため、期限で失効させる。単に「メモ遷移中は無視する」方式は、演出中のユーザー操作を取りこぼすため採らない。**アプリ主導のサイズ変更を新しく追加する場合は、`setSize` の直前に `expectProgrammaticResize` を呼ぶこと。**

<a id="geometry-and-painting"></a>

### 経路と描画

- 経路（`buildOutline`）：ウィンドウ枠（外形の角丸16px、枠線1px）の内側**4px**に線の中心を置き、角の半径は**13px**（枠の内側の縁15pxから線までの距離3pxを引いた12pxに、+1pxの補正を加えた値）。左上の角の45度の位置を始点に時計回りに一周する閉じた折れ線と、累積弧長テーブルを作る。サイズ変更のたびに作り直し、`pointAt` は二分探索で位置を引く。経路が成立しない小さなウィンドウでは何も描かない（最小ウィンドウ640×420では常に成立）
- 描画（`paintFrame`）：位相 `t` から1フレームを描く。`t<0.59` は左上から二方向（上辺側＝主色、左辺側＝副色）に伸びる線と16段階の濃淡の尾、以降は全周の線が約19px周期の断片に分かれ、丸い線端のまま全断片が同じ位相で点へ縮んで消える。粒化フェーズは全断片が同じ透明度・線幅を共有するため、方向ごとに1本のパスにまとめて描く（1フレーム2ストローク）。時間・光量の数値は要件05の選定値を実装定数として持つ
- Canvasは毎フレーム現在の論理サイズ・表示倍率（上限2）でバッファを必要時のみ作り直す。アプリ主導のサイズ変更後もそのまま枠に追従し、DPI変化では中断しない
- 試作の `getPointAtLength` を毎フレーム多数回呼ぶ作りは移植していない

<a id="glow-color-single-definition"></a>

### 演出色の単一定義

光の2色は `src/styles.css` の `:root` の CSS 変数（`--ui-glow-primary`／`--ui-glow-secondary`）が**唯一の定義**。`tailwind.config.js` の `ui.glow-primary`／`ui.glow-secondary` はこの変数を参照し、Canvas は再生開始時に `getComputedStyle(document.documentElement)` で同じ変数を読む。Canvas は解決済みの色文字列を必要とするが、Tailwind の設定を実行時に読み込むと不要に大きくなるため、変数を介して値の二重定義を避けている。色が取得できない場合はフォールバック値を持たず、警告を出して再生しない。アプリはライト基調のみのためテーマ分岐は持たない。共有 token の原則は [shared-ui-system.md](shared-ui-system.md#semantic-tokens) を参照。

<a id="toggle-setting"></a>

### 演出専用のON/OFF設定

`AppSettings.screenTransitionAnimationEnabled`（Rust `screen_transition_animation_enabled`、`serde(default = "default_true")` のため旧設定ファイルでもON）を、全般タブのピン止め機能の直下に見出しグループなしで置く。保存経路は既存の即時保存トグルと同じ（`set_screen_transition_animation_enabled`→`AppSettings` を返す。失敗時は表示が元の値に戻り、エラーは出さない）。保存モデルは [settings-panel-architecture.md](settings-panel-architecture.md#save-model) を参照。この設定の対象は本演出だけで、将来の別の演出を暗黙に含めない。

<a id="automated-tests"></a>

### 自動テストの範囲

`npm run test:unit`（`tools/screen-transition.test.mjs`、Node標準のテストランナー。新規依存なし）が、判定・位相・経路・リサイズ分類・描画（記録用コンテキスト）・コントローラ（rAF・Canvasを差し替えたハーネス）を検証する。テスト対象の `src/lib/screenTransition*.ts` は、Nodeの型除去機能で直接読めるよう、内部のimportを `.ts` 拡張子付きにし、型のimportを `import type` で分けている。React側の配線（`AppMain` のeffect、`useSyncExternalStore` によるCanvasの載せ外し）とTauriイベント（`onResized`・`scaleFactor`）は自動テストの対象外で、型検査・ビルドと実機確認による。

## 未検証事項（実機で確認していない。確実な動作として扱わない）

- メモ画面への遷移の `setSize` で `onResized` が1回で目標サイズに一致するか。中間サイズを含めて複数回届くと利用者のリサイズと誤判定され、演出が途中で消える。許容誤差（2px）・期限（1.5秒）の妥当性。発生した場合は、照合条件の調整、または `WM_ENTERSIZEMOVE`／`WM_EXITSIZEMOVE` の捕捉（unsafeを伴う）を含め、設計方針を再検討する（自動では切り替えない）
- 125%／150%等の実倍率での線の見え方、モニタ間移動時に論理サイズが許容誤差内に収まるか、倍率上限2を超える表示での柔らかさ
- `shadowBlur`＋`backdrop-blur-xl` のルート上での実フレームレート、低スペック環境での負荷、非常に大きなウィンドウでのバッファ量
- 新画面マウント時（最近使ったファイルのShellアイコン取得、メモのロード）の冒頭のフレーム落ち
- 非表示中のWebView2でReactのコミット・effectが通常どおり実行されるか（利用者復帰の許可方式のため誤発火の原因にはならない）
- React StrictMode（開発ビルド）でのref二重呼び出しの実挙動（コード上は開始待ちを二重に作らない）
- モーダルと視覚的に重なった場合の見え方、暗い壁紙の上でのコントラスト

## 経緯

<a id="rejected-alternatives"></a>

### 検討して採らなかった案

- **SVG近似（共通レイヤー＋SVG）**：`stroke-dasharray` と丸い線端で、少数の要素でも近似できると評価されたが、POが選定した試作の発光・粒化を実機比較なしで置き換える理由がないため、Canvasを採用した
- **画面ごとのCSS演出**：7画面への重複と、アンマウントをまたぐ中断・再開始が成立しないため不採用
- **可視フラグ＋`onFocusChanged(true)` で非表示中の復帰を除外する案（初版）**：正しさが「再表示前にReactのコミットが完了すること」と「`show()` 後にfocus通知が届くこと」に依存し、コミットが非表示中に遅延すると再表示のたびに誤発火するおそれがあった。原因で区別する現在の方式に置き換えた
- **「再表示が `closeWindow` のcleanup完了より先に来る」競合の懸念**：画面遷移（`view` の反転）を起こすのは `cleanup` の同期部分で、`hideWindow()` の解決直後の単一のJS実行区間内に完了する（[window-lifecycle.md](window-lifecycle.md#reopen-during-cleanup-tradeoff)）。cleanupの非同期部分（frecency記録・検索結果の再取得）の遅れは画面遷移と無関係であり、懸念は撤回した
- **モーダルより下に表示する案**：各画面ルートの重ね合わせコンテキストのため外側のレイヤーでは実現できない。「モーダル表示中は開始しない」案も、モーダルの有無を集約する状態が現状なく、通常経路での発生も稀なため採らず、視覚的な重なりを許容した
- **「メモ遷移中はリサイズを無視する」案**：演出中のユーザー操作を取りこぼすため不採用（目標サイズ・期限の照合を採用）
- **ネイティブ通知（`WM_ENTERSIZEMOVE`／`WM_EXITSIZEMOVE`）**：unsafeが必要で、照合方式で誤判定が実測された場合の代案としてのみ位置づけている

<a id="inset-adoption"></a>

### 線の位置（内側余白）の選定

試作は枠の内側8px（半径9px）だった。実機で4pxも比較したうえで、PO判断により**4px（半径13px）を採用**した。単発の位置調整であり、原則としては扱わない（値は `screenTransition.ts` の `INSET`／`CORNER_RADIUS` が正本）。
