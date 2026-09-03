# 検索結果一覧の選択状態管理・行構造

対象コード: `src/lib/selectIntent.ts`（`SelectIntent`型・`resolveSelected`・`SELECT_INTENT_TIMEOUT_MS`の実体）、`src/hooks/useSearch.ts`（`rows`・intent）、`src/hooks/useTreeEditSelection.ts`（管理画面ツリーのintent・ホバー抑制）、`src/App.tsx`（`handleKeyDown`・`StatusFooter` への受け渡し）、`src/components/ResultList.tsx`（`rows.map` の描画）、`src/components/FavoriteEditTree.tsx`・`src/components/MemoManageView.tsx`（管理画面ツリーの描画）。

横断アーキテクチャ系のファイル。ピン止め・お気に入り・今後のメモ機能など、検索結果一覧に新しい行種別を追加する機能はすべてこのファイルの設計に乗せること。

## 現在の設計

<a id="selection-is-derived"></a>

### 選択モデル（intent 方式）の実装

**設計原則そのもの**（選択は行番号や位置ではなく対象の識別子から導出する intent として扱い、書き込み可能な state にしない／その原則を採用した理由／適用範囲の定義）は、外部設計書 `external-design/02-list-and-selection.md#selection-model` へ移設した。**本節には実装の詳細のみを置き、原則を重複して書かない。**

型と導出関数：

```ts
type SelectIntent =
  | { type: "top" }
  | { type: "key"; key: string; expiresAt?: number };

interface SelectableItem {
  key: string;
}

function resolveSelected(
  intent: SelectIntent,
  items: SelectableItem[],
  fallback: number
): number {
  if (intent.type === "top") return 0;
  const index = items.findIndex((item) => item.key === intent.key);
  return index === -1 ? fallback : index;
}
```

外部設計書の「識別子が見つからない場合も現在の表示を維持する」という原則は、`resolveSelected` の第3引数 `fallback`（直前に導出できた選択インデックス）をそのまま返す実装として表現されている。`fallback` の実際の値は `selectedFallbackRef`（直前の解決結果を保持する `useRef`）から渡す。維持を打ち切るタイムアウトの実装は [reset-triggers](#reset-triggers) の7・8を参照。

`selected` への書き込みは、`intent`／`rows`／`clipboardSelectionItems` の変化を検知する1本の `useLayoutEffect`（`resolveSelected` を呼んで `setSelectedRaw` する箇所）だけになっている。それ以外のすべての操作（クエリ変更・↑↓・ホバー・ピン止め追加/解除・D&D）は `intent` を更新するだけにとどめる。`useLayoutEffect` を使う理由は、ブラウザが描画する前に選択を確定させ、「一瞬正しい選択が見えた直後に別の値に上書きされる」ちらつきを構造的に防ぐため。

適用範囲の定義（どの選択ドメインが intent 方式に乗るか）は外部設計書 `external-design/02-list-and-selection.md#list-structure-layers` が正本。実装上の対応は以下のとおり：`useSearch.ts` 内の単一の `intent`/`selected` が「通常モード（`rows`）」「`clipboardMode`（`clipboardSelectionItems`）」「`favoriteMode`（`favoriteTree`）」の3ドメインをモード判定で切り替えて共有する。一方、お気に入り管理画面は `useFavoriteEditSelection.ts`、メモ画面とメモ管理画面はそれぞれの `useTreeEditSelection.ts` 呼び出しが、同じ `resolveSelected` の実装を再利用しつつ**独立した** `intent`/`selected` を持つ（お気に入り管理画面がかつて持っていた仮想ルート行はissue 0026で撤去済み。詳細は [favorites-data-model.md](favorites-data-model.md#favorite-edit-virtual-root-row-removed) を参照）。Web検索行の +1 特例は [web-search-row-exception](#web-search-row-exception) を参照。

`clipboardMode` の選択対象一覧（`clipboardSelectionItems: SelectableItem[]`）は `useSearch.ts` 内の state だが、実体（`clipboard.clipboardEntries`）は `useClipboard.ts` 側にある。`useSearch` は `useClipboard` の戻り値に依存できない構成（`useClipboard` が `useSearch` の戻り値を入力として受け取るため、循環になる）なので、逆方向に「`useClipboard.ts` 側が `clipboardEntries` の変化を検知して `syncClipboardSelectionItems`（`useSearch` の戻り値）へ push する」という設計にした。

<a id="reset-triggers"></a>

### intent を {type:'top'} へリセットする唯一の汎用トリガー

intent を `{type:'top'}` へリセットするのは、以下の1本の `useEffect` のみである（`pinnedPathSet`/`frecency`/`recentResults` を依存配列に含めない。含めるとピン止め操作の副作用でこの reset effect が発火し、[フェーズD](#phase-d) と同じ競合が intent 経由で再発するため）：

- クエリ・設定（`appSettings`/`settingsVersion`）・`closeRefreshTick`（ウィンドウを閉じた直後の強制再取得。詳細は [window-lifecycle.md](window-lifecycle.md#close-window-common-design) を参照）の変化 → `updateIntent({type:'top'}, "query-or-settings-change")`

かつては `recentMode` 中の `recentResults` の変化（フォーカス復帰時の再取得を含む）を検知する専用の強制リセット effect が別途存在したが、[フェーズD-3](#phase-d3) でこれを撤去した。現在は `recentMode` を含む全モードが、この1本の汎用トリガーと `resolveSelected` の fallback 挙動だけで選択の一貫性を保っている。

intent を更新している全箇所（すべて `updateIntent(next, source)` という同一のラッパー経由。ログの `source` でどの経路から更新されたか追える）：

1. 上記の汎用リセットトリガー
2. `selectRowByKeyboard(key)`：↑↓キーによる通常モード／`clipboardMode` の選択（`expiresAt` なし。即座に解決できるため）
3. `selectRowFromHover(key, x, y)`：マウスホバーによる同上（抑止ロジックは [hover-suppression](#hover-suppression) を参照）
4. `togglePin` 追加分岐：`{type:'key', key: "pinned:<path>", expiresAt: now+1000}`
5. `togglePin` 解除分岐：`{type:'key', key: "file:<path>", expiresAt: now+1000}`
6. `reorderPinned`：`{type:'key', key: "pinned:<moved.path>", expiresAt: now+1000}`
7. `toggleFavorite` の★解除分岐（`favoriteMode` 中、`/favorite` 一覧自身から解除した場合のみ）：解除で消える行の次（無ければ前）のアイテム行の識別子を `{type:'key', key: <neighbor.key>, expiresAt: now+1000}` として積む（見つからなければ `{type:'top'}`）。`togglePin` の解除分岐と同じ「削除後に別の場所へ移動する対象を識別子で追う」パターン
8. タイムアウト効果（`intent.expiresAt` を過ぎても対象が見つからない場合）：`{type:'top'}`

上記7のようなモード別の `expiresAt` 付き intent を扱うため、8のタイムアウト判定は「見つからない」を判定する対象一覧をモードに応じて `rows`／`clipboardSelectionItems`／`favoriteTree` の3つに切り替える。実装は `rowsRef`／`clipboardSelectionItemsRef`／`favoriteTreeRef` という3つの `useRef` ミラーをモードごとに用意し、`useEffect` 内で最新値を都度書き込むことで、タイムアウト判定effect自体の依存配列に `rows` 等の頻繁に変化する値を含めずに済ませている（依存配列に含めると、変化のたびにタイマーの期限が延長され「`expiresAt` の時点で強制的に諦める」というタイムアウトの意味が失われるため）。

**この原則は `useTreeEditSelection.ts`（お気に入り画面・メモ画面が使う共有の選択基盤）にも同様に適用する。** 具体的な失敗パターンと修正は [tree-edit-selection-reset-key-identity-bug](#tree-edit-selection-reset-key-identity-bug) を参照。値を直接依存配列に含める場合だけでなく、**その値を閉じ込めた `useCallback` の戻り値（関数）を依存配列に含める場合も、間接的に同じ違反になりうる**点に注意すること（関数の中身が同じロジックでも、依存する値が変わればフックとしての「アイデンティティ」が変わり、それ自体が意図しないトリガーになる）。

**経緯（段階3・軸1のAD実装批評で指摘・実装前に解消）**：お気に入り編集ビュー実装当初の設計案では、この分岐に `favoriteMode`（`favoriteTree`）が無く、`favoriteMode` 中に発行された `expiresAt` 付き intent（`toggleFavorite` の★解除等）が常に `rowsRef`（`favoriteMode` 中は空配列）を参照して「見つからない」と誤判定し、正しく選択解決された直後でも約1秒後に `{type:'top'}` へ強制的にリセットされる潜在バグとして指摘された。`clipboardSelectionItemsRef` と同じ鏡写しパターンで `favoriteTreeRef` を追加して解消した。**新しい選択ドメインを追加する場合、この分岐（タイムアウト判定effect内の `items` 算出）にも対応するモードの鏡refを追加すること**（追加を忘れると、そのドメインの `expiresAt` 付き intent がすべて誤ってタイムアウト扱いになる）。

<a id="sync-vs-async-restore"></a>

### 同期的に確定する移動先と、非同期でしか確定しない移動先

「識別子に紐づけて選択を復元する」という原則自体はどのケースでも変わらない。変わるのは復元の実装方法（同期 or 非同期）であり、これは「移動先が操作時点で確定的に分かるかどうか」で機械的に判断できる。

- **移動先が確定的に分かる場合**（末尾追加、ドロップ先固定など）は、同期的に `setSelectedRaw` を呼んで即座に楽観的反映を行い、`requestSelectRestore(key)` で対象の識別子を intent として登録する
  - ピン止め（追加）：新規ピンは実装上必ずピン止めブロックの末尾（`order` 最大）に追加されるため、追加前のピン止め件数がそのまま追加後の末尾インデックスになる
  - 並び替え：ドロップした瞬間に新しい順序と移動先インデックスの両方が確定している
- **移動先が予測できない場合**（ピン止め解除。通常一覧内の frecency 順位は `search_files` の応答を見るまで分からない）のみ、`rows` の変化を検知する `useEffect` で `rows.findIndex((row) => row.key === key)` による識別子照合を行い、見つかるかタイムアウト（1秒）まで待つ

複数のリストにまたがって識別子（パス等）で照合する場合、リストごとに識別子の保持形式・生成経路が異なりうる点に注意する（本アプリでは通常結果は `search_files` の Rust 側で `WalkDir` から得たパス、ピン止めブロックは `FavoriteNode.value` に保存されたパスというように、生成元が異なる識別子を同一視して比較している。詳細は [favorites-data-model.md](favorites-data-model.md) を参照）。将来的に一方にだけ正規化処理が入る、あるいは異なる由来のID体系を混在させる、といった変更が入ると容易に照合が壊れるため、識別子を新たに追加する際は生成経路が同一かどうかを意識し、異なる場合は比較前に正規化して表記を揃えること。

<a id="fallback-unsafe-across-structural-change"></a>

### fallback に「直前のインデックス」を使ってよい条件

`resolveSelected` の `fallback`（識別子が見つからない場合に返す値）へ「直前に解決できたインデックスをそのまま渡す」設計は、**items配列の構造（要素の増減・並び順）が、識別子の探索と無関係な理由で変化しない場合にのみ安全**である。

通常モード（`rows`）はこの前提が成り立たない。`rows` はファイル検索結果（`results`。非同期にしか確定せず、検索中は直前の完了結果を保持し続ける）と、ピン止め・数式計算・URLエンコード/デコード・パス貼り付け候補などの固定候補（`pinnedVisible`・`calcResult` 等。検索文字列の変化に対して同期的・即時に増減する）を、同じ配列の異なる位置（固定候補は先頭側）へ連結して作る。固定候補が増減すると、後続のファイル検索結果側の要素は配列内で位置がずれる。この状態で「識別子が見つからない」場合に直前のインデックスをそのまま fallback に使うと、ずれた配列の同じ数値位置にたまたま存在する無関係な要素（保持中の直前検索結果のどれか）を指してしまい、可視的に無関係な行が一瞬選択される（詳細・実例は[経緯](#fallback-unsafe-async-select-jump)を参照）。

このため、**「識別子が見つからない場合に fallback として渡す値」を選ぶ際は、items配列が「非同期にしか確定しない部分」と「同期的に即時更新される部分」を同じ配列内に混在させていないか（特に、後者の増減が前者の要素の位置をずらす配置になっていないか）を必ず確認すること。** 混在している場合、直前のインデックスは安全な fallback にならない。この場合は数値インデックスを流用せず、`-1`（選択なし）を返し、非同期部分が確定してから改めて解決させる。本アプリの `selected: number` は既存の設計で `-1` を安全に許容する：`rows[-1]` は `undefined` となるため `selectedRow = rows[selected] ?? null`（`App.tsx`）が `null` を返し、`ResultList.tsx` の `isSelected = index === selected` はどの行とも一致せずハイライトなしになり、Enter は「選択可能な項目がなければ何もしない」の既存分岐がそのまま働き、↑↓キーは `Math.min(selected+1, len-1)`/`Math.max(selected-1, 0)` で `0` へ正しくクランプされる。**このいずれも `selected` を消費する側に新しい `-1` 分岐を追加する必要がない**（`?? null`・`===` 一致比較・`Math.min`/`Math.max` によるクランプが、既存のまま `-1` を意図通り扱う）。

<a id="adding-a-row-kind"></a>

### 新しい行種別の追加方法

`rows: ResultRow[]`（`src/hooks/useSearch.ts`、`src/types.ts` の判別可能 Union）が通常モードの結果一覧の並び順の正本である。並び順を変更する場合は `rows` の構築ロジックのみを直し、他の箇所（`App.tsx`/`ResultList.tsx`）はそれを参照するだけにする。

`ResultRow` の各バリアント（`kind: "pinned" | "pathPasteShortcut" | "pathPasteAddFolder" | "pathPastePin" | "pathPasteFavorite" | "calc" | "urlConvert" | "file"`）は、`rows` の並び順（ピン止めブロック→パス貼り付け候補（機能2→機能1→機能3→機能4の順）→計算結果→URLエンコード/デコード結果→ファイル検索結果）にそのまま対応する。`key` フィールドはファイルパス等に種別ごとの接頭辞（`pinned:`/`file:` 等）を付けたもので、他種別のキーと衝突しない安定した識別子として持たせている（行番号は使わない。行の追加・削除で他の行の React key が変わらないようにするため）。`pinned`/`file`/`pathPastePin`行は`isPinned(path)`によるピン止め状態（`pinned: boolean`）、`pinned`/`file`/`pathPasteFavorite`行は`isFavorited(path)`によるお気に入り登録状態（`favorited: boolean`）を、`rows`構築時（`useSearch.ts`）に事前計算して埋め込む。

`pinned`（ピン止めブロック）の `exists`／`file`（ファイル検索結果）の `pinned` は、`rows` 構築時に一度だけ計算して各行に埋め込む（`exists: pinnedExistence[file.path] ?? true`、`pinned: isPinned(file.path)`）。`ResultList.tsx` 側の描画はこの埋め込み済みの値（`row.exists`/`row.pinned`）を使い、行ごとに個別で再計算しない（`pinIconVisible` によるアイコン自体の表示可否は行データではなく表示設定のため、描画側で `pinIconVisible && row.pinned` のように別途掛け合わせる）。

選択中の行の種類の判定は、常に `rows[selected].kind` で行い、`pinnedLength`/`pathPasteLength`/`calcLength`/`urlConvertLength` のような個別のオフセット変数を新設しないこと。

<a id="web-search-row-exception"></a>

### Web検索行の baseLength 特例（意図的な未統合）

Web検索行（「Googleで〇〇を検索」）は `rows: ResultRow[]` に含まれておらず、`App.tsx` 側で `baseLength`（= `rows.length`）への+1という特例で扱われている（`selected === baseLength` の判定、`handleKeyDown` での switch 手前での分岐等）。

これは R-1 のフェーズC の時点で意図的に見送った設計判断であり、バグではない。理由：Web検索行は `prefixCommandMode` の候補一覧と通常モードの一覧の両方に共通して末尾へ付く横断的な行であり、「通常モードのみ」という R-1 のスコープに単純には収まらないため。

将来この行が原因の不具合（選択がずれる、行が消える等）が疑われた場合は、まずこの+1特例の算出箇所（`App.tsx` 内の `baseLength`・`handleKeyDown` のWeb検索行分岐）を確認すること。`rows`/`resolveSelected` の仕組みには含まれていないため、`rows` 側の調査をしても見つからない。対応する場合は R-1 フェーズE（未着手）として着手する。現時点では優先度が低く保留中。

<a id="hover-suppression"></a>

### マウスホバーとキーボード操作の競合回避

選択操作を「キーボード操作」と「マウスホバー」で分離している。検索一覧では `selectRowByKeyboard` / `selectRowFromHover`、管理画面の共有選択hookでは `selectByKeyboard` / `selectByHover` が対応する。一覧の再描画・オートスクロールでカーソル直下の行がユーザーの手を離れて入れ替わった際、その `onMouseEnter` がキーボードでの選択結果を横から上書きしてしまう不具合の対策で、以下2つの条件のいずれかに該当する `onMouseEnter` は無視する：

1. 直近のキーボード操作から `HOVER_SUPPRESS_AFTER_KEYBOARD_MS`（200ms）以内
2. `onMouseEnter` 発火時点の座標が、一覧コンテナの `onMouseMove`（`recordMouseMove`）で直近に記録した実際のマウス移動座標とほぼ同じ（＝カーソル自体は静止しており、再描画で該当行がたまたまカーソル直下に来ただけ）

通常の↑↓だけでなく、Ctrl+Shift+矢印による並び替え・再親化もキーボード操作として扱い、移動対象を `selectByKeyboard` に渡す。非同期再取得後に選択を明示復元する経路では、その復元時にも `selectByKeyboard` を使って再描画直後をホバー抑止期間の起点にする。D&D・クリック・作成後の選択はポインター／プログラム起点なので `selectByKey` を使い、この抑止時刻を更新しない。

<a id="dom-structure-and-dividers"></a>

### 結果行の DOM 構造（`<div role="button">`）と区切り線を使わない方針

`ResultList.tsx` の `rows.map` が描画する8種類の行（`pinned`/`pathPasteShortcut`/`pathPasteAddFolder`/`pathPastePin`/`pathPasteFavorite`/`calc`/`urlConvert`/`file`）は、行のルート要素を `<button>` ではなく **`<div role="button">`** で実装している。

- `role="button"` は、この要素がクリックで実行される操作であることをアクセシビリティツリー上に示すためのもの。ただし `tabIndex` は付与していない（キーボード操作は行そのものにフォーカスを当てる設計ではなく、検索ボックス側の document レベル `keydown` リスナー・↑↓キーによる選択インデックス管理で完結しているため。フォーカス移動を伴うキーボード操作の対象にする設計ではない）
- `type="button"` 属性は行の要素には元々付与されていなかった（`div` になった今も不要）。`PinToggleButton`／`FavoriteToggleButton` 自身の `<button type="button">` は実在する `<button>` として維持しており、入れ子構造ではなくなったため `type="button"`・クリックの `stopPropagation()` ともにそのまま機能する
- `<button>` → `<div>` の変更に伴う見た目の補正は不要だった。本プロジェクトは `@tailwind base`（Preflight）を有効にしており、Preflight が `button` 要素に対して `border-width: 0`・`background-color: transparent`・`font-family: inherit` 等を既定で適用するため、これらの行の `<button>` は元々ブラウザ既定の見た目（枠線・背景色・ボタン風フォント）を一切持っていなかった。カーソル形状についても、ブラウザは `<button>` に既定で `cursor: pointer` を与えない（`<a href>` とは異なる）ため、`<div>` 化してもカーソル形状は変化しない。レイアウトに関わる `display`/`text-align`/`width` 等はいずれも `className`（`flex items-center` `text-left` `w-full` 等）で明示済みのため、タグ変更による差分は生じない

**結果行のルート要素は `<div role="button">` であり、行の内部に操作ボタン（ピン止めトグル、★お気に入りボタン、メモ作成アイコン等）を複数個置く前提の構造である。** 行に新しい操作ボタンを追加する場合、行のルート要素を `<button>` に戻さないこと（内部の操作ボタンとの入れ子が再発する）。

**結果行に区切り線（`border-b`/`border-t` 等）は使わない。** 視認できない装飾を残す実益がないため、既存の全種別の行から削除し統一した。**今後、結果行に区切りを表現したくなった場合も `border-b`/`border-t` のような境界線ではなく、既存の選択中/非選択の背景色差・hover 背景色のみで表現すること**（設定画面の「縦ラインによる区切りは使わない」方針と同様。詳細は [settings-panel-architecture.md](settings-panel-architecture.md) を参照）。

<a id="known-limitations"></a>

### 既知の限界

`intent.type === 'key'` の間はどんな理由でのリセットも一律に抑止される（reset トリガーの条件自体が `intent` を経由せず直接 `pinnedPathSet` 等を見ているわけではないため）。ごく短い時間（`set_favorites` のIPC往復中）にユーザーが次の操作を行った場合、新しい `intent` がすぐさま古い `intent` を上書きするため通常は問題にならないが、理論上のレースそのものが解消されたわけではない（書き込み経路が構造的に分離されたことで、[フェーズD](#phase-d) で文書化されていたのと同種の競合は再発しなくなった、という意味での改善）。

## 経緯

以下は現在の設計に至るまでの変遷の記録。置き換え済みの中間設計も、同種の設計判断を将来行う際の参考として意図的に残している。

### 管理画面の並び替え後に静止カーソル位置へ選択が戻る不具合

お気に入り管理画面とメモ管理画面が共有する `useTreeEditSelection` は当初、検索結果のような非同期差し替えがないという前提でホバー抑制を省いていた。しかし両管理画面の並び替え・再親化は、Rustコマンド後にツリーを再取得して行DOMを並べ直す非同期更新である。この再描画で静止カーソル直下へ別の行が移ると、その行の `onMouseEnter` が汎用の `selectByKey` を呼び、移動対象を保持していたintentを上書きしていた。

個々の並び替えハンドラへフラグを追加するのではなく、`useTreeEditSelection` 自体へ検索一覧と同じキーボード／ホバー入口と座標記録を実装した。これにより、同じ構造を持つ通常の↑↓、並び替え、再親化のすべてが共通規約で保護される。

### 出発点：識別子ベースでの選択復元という原則

ピン止めの追加・解除・並び替えを行うと選択行が毎回1行目にリセットされる不具合があった。3ケースを個別に直すのではなく、以下の汎用原則として実装することにした。

- 選択状態は行番号ではなく、操作対象の識別子（ファイルパス等）に紐づけて復元する
- 識別子が新しいリストに見つからない場合は、復元をあきらめて先頭を選択する
- スクロールは既存の `useScrollSelectedIntoView`（選択インデックスが変化するたびに対象行を `scrollIntoView` する仕組み）にそのまま乗る（専用処理は書かない）

### 第1世代：`pendingSelectPathRef` による非同期照合

一覧の再取得が非同期で、かつ移動先が操作時点では予測できない場合（ピン止め解除）に対応するため、復元したい識別子を `useRef` に保持し、一覧の再構築が完了した時点で探して選択インデックスに反映する仕組みを最初に実装した。無期限に探し続けると誤った復元につながるため、タイムアウト（1秒）で明示的に1行目へフォールバックする設計にした（`console.debug` で復元できなかった識別子を出力する。原因調査を容易にするため）。

対象が複数の非同期処理（`search_files` の再取得と `get_pinned_files` の再取得の両方）にまたがる場合も、関連する state（`pinnedFiles`／`results` 双方）を依存配列に持つ1つの `useEffect` に復元ロジックを集約した。

### 第1世代の不具合：追加・並び替えが復元されない

初版の実装は「追加・解除・並び替えの3ケースすべてを `requestSelectRestore` に統一する」形にしていたが、実機検証で**解除は正しく復元されるが、追加（ピン止め）と並び替えは復元されず1行目に飛ぶ**という不具合が見つかった。

調査として「通常結果側 (`path`) とピン止めブロック側 (`FavoriteNode.value` 由来) でプロパティ名や表記が食い違い、ピン止めブロック側の照合だけが常に失敗している」という仮説を検証したが、Rust 側 (`get_pinned_files`) ・フロントエンド側とも、プロパティ名・比較方法に不一致は見つからなかった。原因を完全に断定できないまま実機での長時間切り分けに頼るのは非効率と判断し、根本原因の特定よりも「そもそも非同期の照合に頼らずに済む設計に直す」方向で解決した。

解決した設計：**移動先の行が操作時点で確定的に分かる場合は、非同期の照合を経由せず、その場で同期的に選択インデックスを設定する。**

- 並び替え：ドロップした瞬間に新しい順序と移動先インデックス（`toIndex`）の両方が確定しているため、`reorderPinned` 内で直接 `setSelectedRaw(toIndex)` を呼ぶ
- ピン止め（追加）：新規ピンは実装上必ずピン止めブロックの末尾（`order` 最大）に追加されるため、追加前のピン止め件数がそのまま追加後の末尾インデックスになる。`togglePin` の追加分岐内で `setSelectedRaw(pinnedNodes.length)` を直接呼ぶ
- ピン止め解除：唯一、移動先（通常一覧内の frecency 順位）が操作時点で予測できないケースのため、引き続き非同期の `requestSelectRestore` の仕組みを使う

同期で解決できる操作をわざわざ非同期の照合機構に乗せると、照合ロジック自体に問題がなくても、非同期処理特有のタイミングやレースが疑わしく見えてしまい、調査の見通しを悪くする、という教訓が得られた。

### 第2世代の不具合：「リセットの抑止」と「非同期での選択復元」の混同

上記の同期化を実装した後も、実機で不具合が再発した。追加・並び替え直後、一瞬正しい行が選択されたように見えた直後に1行目へ戻ってしまう、という症状だった。

原因：`pendingSelectPathRef` は元々「非同期の識別子照合」専用の仕組みだったが、メイン検索effect側のリセットガードが、この `pendingSelectPathRef` の有無を「今リセットして良いか」の判定に流用していた。ピン止め追加・並び替えを同期化した際、これらの操作はもう `pendingSelectPathRef` をセットしなくなったため、ガードが素通りするようになり、同期的に正しく設定した選択インデックスを、直後に再実行されたメイン検索effectが1行目へ上書きしていた。

一般原則：「リセットの抑止」（今このタイミングでは1行目へ戻さないでほしい、という指示）と「非同期での識別子照合による選択復元」（照合が完了するまでリストの変化を待ち、見つかったら選び直す、というロジック本体）は別の関心事であり、1つの ref に両方を担わせると、片方の性質だけを必要とする操作を追加したときに意図しない挙動になる。

解決した設計：`pendingSelectPathRef` から「リセットの抑止」の責務を切り離し、専用の `suppressNextSelectResetRef`（`useRef<boolean>`）を新設した。ピン止め追加・並び替えは、同期的に `setSelectedRaw` を呼んだ直後に `suppressNextSelectReset()` でこのフラグを立てるだけ（照合・タイムアウトは一切行わない）にした。

既知の限界（この時点）：ごく短い時間（`set_favorites` のIPC往復中、体感では数十ms程度）に限り、ユーザーが即座に次の操作（クエリ入力等）を行うと、その正当なリセットが誤って1回だけ抑止される理論上の競合が残っていた（逆に、フラグを毎回確実にクリアする設計にしているため、抑止が永続して以後ずっと効かなくなることはない）。

<a id="phase-d"></a>

### フェーズD：識別子ベースへの統合、その後のリグレッション

R-1（結果行のフラット配列化。詳細は次項）の一環として、`pendingSelectPathRef`（ファイルパスのみ保持）と `suppressNextSelectResetRef`（識別情報を持たない一度きりのブールフラグ）の2本立てを廃止し、単一の `pendingSelectKeyRef: useRef<string | null>`（`ResultRow["key"]` と同じ形式の識別子）に統合した。解決ロジックは `rows` を依存配列に持つ1本の `useEffect` に一本化し、`rows.findIndex((row) => row.key === key)` で対象行を探すようにした。

これにより「同期的に確定している場合」と「非同期でしか確定しない場合」が同じ1つの識別子ベースの仕組みに統合され、専用の抑止フラグを別途持つ必要がなくなった——はずだった。

しかし実機で次のリグレッションが確認された：ピン止め追加・D&D並び替え直後、一瞬正しい行が選択された直後に先頭行へ戻ってしまう（ログ上は選択の解決の直後に `search_files` の解決が完了し、選択が先頭へ戻っていた）。

原因：選択の復元が成功した時点で `pendingSelectKeyRef` が `null` に戻り、その後遅れて到着する `search_files` 解決時のリセット処理を、もはや抑止できなくなっていた。**根本原因は、`selected` が「複数の非同期処理がそれぞれ書き込める state」であったこと。** ピン止め操作・D&D・検索結果の解決が、それぞれ独立に `selected` へ書き込む経路を持つ限り、一発の抑止フラグで特定の書き込みだけを抑止しても書き込みの経路自体は残り続け、別のタイミング・別の非同期処理の組み合わせで同種の競合が再発する。フェーズDの識別子ベース化は「復元の照合方法」を改善しただけで、「書き込み経路が複数存在する」という構造上の問題そのものには手を付けていなかった。

<a id="phase-d2"></a>

### フェーズD-2：intent ベースへの再設計

`selected` という書き込み可能な state を廃止し、「ユーザーが選びたい」という意図を表す `intent` と、現在の行一覧から `resolveSelected` で毎回導出する値にした（具体的な設計は「現在の設計」節を参照）。書き込み経路を1本に絞ったことで、書き込み経路が複数存在するという構造的な問題そのものを解消した。

<a id="phase-d3"></a>

### フェーズD-3：`recentMode` に残っていた専用リセットトリガーの撤去

D-2実装時点では、`intent` を `{type:'top'}` へ戻すトリガーが実は2本存在していた：(1) `query`/`settingsVersion`/`appSettings`/`closeRefreshTick` の変化を検知する汎用トリガー（全モード共通）と、(2) `recentMode` 専用の「`recentResults` が変化するたび無条件にトリガーする」effect（`[recentMode, recentResults]` に依存）。(2) は D-2 の対象範囲（「通常モード＋clipboardMode」の intent 化）に含まれていなかったため、古い設計（フェーズD以前からの「`/recent` はフォーカス復帰のたびに毎回1行目へ戻す」という挙動）がそのまま見落とされて残っていた。

D-2完了後の事前調査（D-3着手前）で、この (2) の存在と、それが原因で `recentMode` だけが「他3モード（通常のファイル検索・`clipboardMode`・ピン止めブロック）と異なり、フォーカス復帰のたびに選択が強制的にリセットされる」という非対称な挙動になっていることが判明した。00-requirements.md には「フォーカス復帰のたびに選択をリセットする」という仕様は存在せず、この非対称性は仕様ではなく実装上の見落としと判断し、(2) を撤去した。

撤去後、`recentMode` の選択は他3モードと全く同じ経路——(1) の汎用トリガーと `resolveSelected` の fallback 挙動——だけに統一された。`recentResults` が変化しても（フォーカス復帰時の再取得を含め）、`intent` 自体は変更されない。

### 結果行のフラット配列化（R-1）自体の経緯

上記の一連の不具合の根本原因は、通常モードの結果一覧が行の種類ごとにバラバラの state（`pinnedFiles`／`pathPasteCandidate`／`calcResult`／`urlConvertResult`／`results`）として管理され、それらを1つの選択インデックス空間に対応付けるための同じオフセット計算（`pinnedLength`/`pathPasteLength`/`calcLength`/`urlConvertLength`）が `App.tsx`（`baseLength` 算出・`handleKeyDown`・`StatusFooter` への各 `is*Selected` props）・`ResultList.tsx`（`pinnedOffset` 以下の各 `data-index`/`onMouseEnter`）・`useSearch.ts`（選択復元用 `useEffect`）の3箇所に独立して再実装されていたことにある。新しい行の種類を追加するたびに3箇所すべての同期が必要で、実際に同期漏れに起因する選択リセット不具合を生んだ。

これを解消するため、通常モードの結果一覧を単一のフラット配列 `rows: ResultRow[]` として再構成した。移行は以下のフェーズで段階的に行った：

- **フェーズA**：`rows` の `useMemo` を新設。純粋な計算の追加のみで、既存の `results`・各種 `Length` 変数・フックの外部インターフェースは変更しない
- **フェーズB**：`ResultList.tsx` の通常モードの描画を `rows.map(...)` ＋ `row.kind` の switch へ書き換え。行の種類ごとの個別 JSX ブロックはそのまま switch の各 case へ移植し、個別のオフセット算出を撤去した。この時点では `App.tsx` を変更しない制約のもと、`ResultList.tsx` は既存 props からローカルに `rows` を組み立てる一時的な重複状態だった
- **フェーズB-2**：フェーズBで生じた `rows` 構築ロジックの重複（`useSearch.ts` と `ResultList.tsx` の2箇所）を解消した。`App.tsx` が `search.rows` を `ResultList` の `rows` props として直接渡すように変更し、`ResultList.tsx` 側のローカル `rows` 構築を削除。`rows: ResultRow[]` を構築する箇所は `useSearch.ts` の1箇所のみになった
- **フェーズC**：`App.tsx` から `pinnedLength`/`pathPasteLength`/`calcLength`/`urlConvertLength` を全廃し、`handleKeyDown`（Enter・Shift+Enter の対象特定）を `rows[selected].kind` ベースの判定へ書き換えた。`StatusFooter` も4個の bool props（`isPathPasteCandidateSelected` 等）を廃止し、単一の `selectedRowKind: ResultRow["kind"] | null` props に統合した。`baseLength` は名前を残しつつ内部の算出式を「通常モードでは `rows.length` を直接使う」形に単純化した
- **フェーズD／D-2／D-3**：上記「フェーズD」〜「フェーズD-3」参照
- **フェーズE（未着手）**：Web検索行（[web-search-row-exception](#web-search-row-exception)）の `rows` への正式統合を検討
- **フェーズF（任意）**：`prefixCommandMode`（プレフィックスコマンド候補一覧）も同じ `ResultRow` の枠組みに統合するかを検討する。現状は別の単純な配列で十分に機能しており、統合の必要性が生じた場合にのみ着手する

### `<div role="button">` への変更の経緯

v0.10.0 でピン止め機能を実装した際、行の `<button>` の中に `PinToggleButton`（ピン止めトグル用の別の `<button>`）を入れ子にしたため、React が `validateDOMNesting`（`<button>` cannot appear as a descendant of `<button>`）の警告を出す状態になっていた。今後この行に★（お気に入り）ボタン・ノート（メモ）アイコンを追加していく計画があり、行内の操作ボタンが増える前提の構造にする必要があるため、行そのものを「内部に操作用の `<button>` を複数個持てる」構造（`<div role="button">` ＋子要素として本物の `<button>` を複数持てる）に直した。

### 区切り線を削除した経緯

v0.10.0 時点で `pinned`/`pathPasteShortcut`/`pathPasteAddFolder`/`calc`/`urlConvert` の5種類には `border-b border-gray-100` が付いていたが、色が薄すぎて実際にはほぼ視認できず、`file` 行だけ付いていないという不揃いな状態になっていた（「見えない装飾をどの行に付けるか」の判断コストだけが発生し続ける状態）。視認できない装飾を残す実益がないため、5種類すべてから削除し、`file` 行と統一した。

他モードの調査結果（変更していない。判断は必要になった時点で行う）：

- `prefixCommandMode`（`prefixCommandCandidates.map`）：`border-b`/`border-t` なし。ボタンの入れ子は存在しない（※この時点の調査。後述「行ルート要素のフォーカス残留によるシステムコマンド誤実行」で `<div role="button">` へ変更済み）
- `clipboardMode`（`ClipboardPanel.tsx` の `entries.map`）：`border-b`/`border-t` なし。ボタンの入れ子は存在しない（※同上、`<div role="button">` へ変更済み）。詳細パネル側の `border-t border-gray-200/60` は一覧の行区切りではなく本文とメタ情報を区切るフッター境界線であり、性質が異なる
- `pathPasteWizardMode`（`PathPasteWizard.tsx` の `folders.map`）：`border-b`/`border-t` なし。ボタンの入れ子は存在しない（※同上、`<div role="button">` へ変更済み）
- `WebSearchRow.tsx`（触っていない）：`border-t border-gray-100` が付いている（今回削除した5種類と同じ薄い色）。同種の「視認できない区切り線」問題が存在する可能性がある（※後述の理由で `<div role="button">` へ変更済み。区切り線自体は本節時点では未着手のまま）

<a id="row-focus-retention-bug"></a>

### 行ルート要素のフォーカス残留によるシステムコマンド誤実行（400_テスト・バグ修正）

システムコマンド（`/shutdown` 等）をプレフィックスコマンド候補一覧からマウスクリックで選択すると確認モーダル（`SystemCommandModal`）が開くが、直後に Enter を押すと確認モーダルの「実行」ボタンを押したわけでもないのに即座にコマンドが実行されてしまう不具合があった。

**調査の経緯**：当初は直前に行った別の修正（`SystemCommandModal`・`RegisterEntryDialog` の Enter/Escape 処理を window レベルの共通 `keydown` リスナーへ一本化した変更）が原因という仮説で、「モーダル側が確認ボタンへ同期的にフォーカスを移してしまい、Enter の既定動作（フォーカス中の要素をクリック）が誤発火しているのでは（`RegisterEntryDialog` で実際にあった不具合と対になる原因）」という仮説を検証した。しかし `SystemCommandModal.tsx` 自体には autoFocus・フォーカス移動処理が一切無く、この仮説は成立しなかった。

**直接原因**：本節冒頭で「ボタンの入れ子が存在しないため未対応のまま残していた」と記録した3箇所（`prefixCommandMode` の候補行・`WebSearchRow.tsx`・`pathPasteWizardMode` のフォルダ選択候補行）と、同じ理由で見落とされていた `ClipboardPanel.tsx` の履歴一覧行が、行のルート要素として実在の `<button>` を使っていた。本アプリは「検索ボックスの `<input>` が常にDOMフォーカスを持ち続ける」ことを前提に、一覧の選択状態は `selected`/`intent`（本節前半を参照）という完全にReact管理下の値だけで表現し、モーダル・ダイアログのEnter/Escapeは window レベルの `keydown` リスナーに一本化する設計（[window-lifecycle.md](window-lifecycle.md#modal-keydown-window-level)）を取っている。ところが行のルート要素が実在の `<button>` だと、マウスクリックでその行を選択した瞬間にブラウザの既定動作としてクリックした `<button>` 自身へDOMフォーカスが移り、この前提が崩れる。`SystemCommandModal` はオーバーレイとして候補一覧の上に重なるだけで一覧自体をアンマウントしないため、フォーカスはクリックされた候補行の `<button>` に残り続ける。この状態で押した次の Enter は、検索ボックスの `<input>`（に `onKeyDown` で束縛された `handleKeyDown`）を経由せず——候補行の `<button>` と `<input>` は兄弟要素であり、React のイベント委譲はイベントの実際のDOM経路上にあるハンドラしか呼ばないため——直接 window の `keydown` リスナーへ到達する。このリスナーは（クリックからEnterまでの間に少なくとも1回レンダリングを経ているため）その時点で最新の `pendingCommand` を正しく参照でき、Enter を「確認モーダルへの確定入力」として処理してしまう。

**横並び調査**：「一覧の行を実在の `<button>` で実装している箇所」を機械的に grep（`<button` の後に `onMouseEnter` を伴うものを一覧行の目印として抽出）した結果、上記4箇所が全て該当した。「一覧からEnterで選択した直後に別の確認要素へフォーカスを移す」という構造そのものを持つのは `SystemCommandModal`（window レベルで Enter/Escape を処理する）だけで、`FavoriteFolderDeleteModal`（お気に入り編集ビューの削除確認）は Escape のみ window レベルで処理し Enter は未束縛のため、同じ行フォーカス残留があっても「削除の誤実行」までは起きない（トリガーである削除アイコンボタン自身の `onClick` が再度呼ばれるだけ）。ただし行ルート要素が `<button>` であること自体は不具合の有無に関わらず本プロジェクトの既存規約（[dom-structure-and-dividers](#dom-structure-and-dividers)）への違反であり、`PathPasteWizard.tsx` のフォルダ選択候補行についても、クリック直後に遷移する次ステップ（名前編集）の `nameInputRef.current?.focus()` が非同期的な競合（`RegisterEntryDialog` で `requestAnimationFrame` 化して修正したのと同種のレース）を潜在的に抱えていた。

**原因の性質**：個々のコンポーネント固有の実装ミスではなく、「一覧行のDOMフォーカス管理」という設計原則（検索ボックスの `<input>` だけが常にフォーカスを持つ）を、`ResultList.tsx` の `rows.map` 由来の各種行にしか適用していなかったという構造的な抜けだった。区切り線の調査（本節前半）の時点で存在に気づいていながら「ボタンの入れ子が無いから」という別の観点だけで判断し、フォーカス管理という観点での再検証をしていなかったことが直接の見落とし要因。

**対応**：`prefixCommandMode` の候補行（`ResultList.tsx`）・`WebSearchRow.tsx`・`pathPasteWizardMode` のフォルダ選択候補行（`PathPasteWizard.tsx`）・クリップボード履歴一覧行（`ClipboardPanel.tsx`）の4箇所すべてを、`ResultList.tsx` の既存の行と同じ `<div role="button">` パターンへ統一した（`type="button"` 属性の削除以外、`className`／`onClick`／`onMouseEnter`／`data-index` はそのまま維持。見た目・クリック操作に変化はない）。個別の分岐やフラグでの対症療法ではなく、「一覧行のルート要素は常に `<div role="button">` とする」という既存規約の適用範囲を、`ResultList.tsx` 内の行だけでなくアプリ全体の選択可能な一覧行へ広げる形で解消した。

<a id="selectable-row-wrapper"></a>

### 再発防止策の検討（共通ラッパー／ESLint／CI）

上記の修正を「ドキュメントに書くだけ」で終わらせると、新しい行タイプを実装する際にドキュメントを読み忘れて同じ違反が混入しうるため、以下3案を検討した。

1. **一覧行の共通ラッパーコンポーネント**：採用。`src/components/SelectableRow.tsx` を新設し、`role="button"` の `<div>`・`data-index`・`onClick`・`onMouseEnter` を1箇所に固定した。行の実装者は `<button>`/`<div role="button">` を直接書く必要がなくなり、`IconSlot`／`Tooltip` と同様「まずこれを使う」共通コンポーネントとして機能する。今回修正した4箇所（`prefixCommandMode` 候補行・`WebSearchRow`・`PathPasteWizard` のフォルダ選択候補行・`ClipboardPanel` の履歴一覧行）はこのラッパーへ移行済み。`ResultList.tsx` の `rows.map` 由来の各種行（`pinned` 等）は、ドラッグ&ドロップ・複数の内部操作ボタンなど個別の事情を持つ行があり、このラッパーの現在のprops（`index`/`className`/`onClick`/`onMouseEnter`/`children`のみ）では表現しきれないため、今回は移行対象外とした（将来 `draggable` 系props等を追加してラッパーを拡張すれば移行可能。無理に今回の修正範囲へ含めず、既存の直書き `<div role="button">` のまま維持する判断とした）
2. **ESLintの独自ルール**：本プロジェクトには現時点で ESLint 自体が導入されていない（`package.json` にESLint関連の依存・スクリプトが存在しない）。ルール1つのためだけに新規ツールチェインを導入するのは、このバグ修正チケットの範囲を超える判断（devDependencies追加・設定作成・導入時点で顕在化する既存コードの他の指摘への対応要否等を伴う）と判断し、見送った
3. **grepベースのCIチェック**：本プロジェクトには `.github/workflows` が存在せず、CI パイプライン自体が無い（Issueテンプレートのみ）。CIを新設する判断も本チケットの範囲を超える。加えて、テキストベースのgrep（`<button` の後に `onMouseEnter` を伴うものを検出、等）は今回の横並び調査でも使えたヒューリスティックだが、行の書き方が変われば容易にすり抜ける（誤検知・見逃しの両方がありうる）ため、AST解析を伴う1の静的チェック（ESLintルール）ほどの信頼性は無い

**結論**：1（共通ラッパー）は新規ツール導入を伴わずに実現でき、実装した。2・3（ESLint／CI）はどちらも「ESLint自体の導入」「CIパイプライン自体の新設」という、このチケットの範囲を超える別判断が前提になるため見送った。ESLint・CIの導入自体を検討する場合は、この一覧行規約のためだけでなく、プロジェクト全体の静的解析方針として別途（200_設計相当で）判断すること。

<a id="window-level-enter-vs-focused-button-bug"></a>

### window レベルEnterハンドラが行内ボタンのフォーカス中に二重発火する（issue 0026 補足修正）

**症状**：メモ画面でフォルダ作成アイコン（実在の `<button>`）へ Tab でフォーカスし Enter を押すと、ボタン自身の作成処理に加えて、選択中フォルダの開閉トグルも同時に発火した。

**直接原因**：`MemoManageView.tsx`・`App.tsx`（お気に入り画面）はいずれも、一覧の行操作（フォルダ開閉・リネーム開始・並び替え等）を window レベルの `keydown` リスナーで処理する設計（[modal-keydown-window-level](window-lifecycle.md#modal-keydown-window-level)と同じ「フォーカス位置に依存しない」思想の応用）を採る。一方、行内の操作アイコン（`IconSlot` が描画するフォルダ作成・削除等）は外部設計書 `external-design/01-screen-transitions.md#modal-key-policy`（Modal・ダイアログのキー操作原則）の「確定はブラウザ標準のフォーカス経路に委ねる」に従い、実在の `<button>` として実装済みで、Tab でフォーカスできる。ボタンにフォーカスがある状態で Enter を押すと、ブラウザは標準動作としてそのボタン自身に `click` を発火させるが、**Enter キーダウン自体はそのまま DOM を伝播して window の `keydown` リスナーにも届く**。この window レベルリスナーは `event.target`（フォーカス位置）を見ずに Enter を「行操作」として一律処理していたため、ボタン自身の処理と行操作の二重発火が起きた。

**横並び調査**：window レベルで Enter を「行操作」として処理する箇所は `App.tsx`（お気に入り画面。フォルダ開閉トグル）と `MemoManageView.tsx`（メモ画面。フォルダ開閉トグル・クリップボードへのセット）の2箇所。いずれも行内に `IconSlot` 経由の実在の `<button>`（フォルダ作成・削除・ゴミ箱を空にする等）とヘッダーの操作ボタン（新規フォルダ・新規メモ・戻る）を持ち、Tab で到達可能なため、両画面・両者のボタンすべてで同種の二重発火が起こりうる構造だった。[row-focus-retention-bug](#row-focus-retention-bug) が扱った「クリックで行の `<button>` にフォーカスが残留する」問題とは発火経路が異なる（今回はTabによる意図的なフォーカス移動）が、根はどちらも「window レベルリスナーがフォーカス位置を見ずに独自のキー処理をする」という同じ設計上の弱さに行き着く。

**リファクタリング要否の判断**：原因は特定のボタン固有の実装ミスではなく、window レベルで行操作を処理する設計パターン自体が、行内に実在の `<button>` を持つようになった時点で共通して抱える構造的な弱さと判定した。個々のボタンへ`stopPropagation`を仕込む対症療法ではなく（新しい行内ボタンを追加するたびに同じ対応を漏らさず行う必要が生じるため）、window レベルリスナー側に「フォーカスがボタン上にある間はEnterによる行操作を行わない」という共通ガードを1箇所ずつ（お気に入り画面用・メモ画面用の各リスナーに1行）追加する形で解消した。

**対応**：両画面の window レベル `keydown` リスナーの先頭付近に、`event.target instanceof HTMLButtonElement` の間は Enter による行操作を行わず早期 return するガードを追加した。ボタン自身の `onClick`（`IconSlot` 経由）が既にクリックを処理するため、二重処理にはならない。矢印キー・F2・Ctrl+Shift+N 等の他のキーは対象外とした（ブラウザがボタンへ副作用のあるデフォルト動作を割り当てていないため、二重発火の実害が無い）。

**再発防止の検証項目**：お気に入り画面・メモ画面それぞれで、行内の操作アイコン（フォルダ作成・削除・ゴミ箱を空にする等）およびヘッダーのボタン（新規フォルダ・新規メモ・戻る）へ Tab でフォーカスした状態で Enter を押し、ボタン自身の処理のみが実行され、選択中の行に対する操作（開閉トグル・クリップボードへのセット等）が同時に発火しないことを確認する。新しい行内ボタン・ヘッダーボタンを追加する場合も、この2箇所のガードで自動的にカバーされる（追加のガードは不要）。

<a id="tree-edit-selection-reset-key-identity-bug"></a>

### `useTreeEditSelection` の resetKey 変化による reset 誤発火（issue 0026 補足修正）

**症状**：お気に入り画面でフォルダ行を選択し `Ctrl+Shift+↓`（同一親内での並び替え）を行うと、操作直後に選択が移動先の行と一覧の先頭行の間を短時間だけ往復して見えた。

**直接原因**：`useTreeEditSelection(tree, resetKey, resetWhen)` は、`resetWhen`（呼び出し元がお気に入り画面では `favoriteEditFilterText`、メモ画面では `filterText` として渡す絞り込み文字列）が変化した時だけ選択を `resetKey`（多くの呼び出し元で「現在の一覧の先頭行の key」）へ戻す設計だった。ところが実装は次の形になっていた。

```ts
const reset = useCallback(() => setIntent({ type: "key", key: resetKey }), [resetKey]);
useEffect(() => { if (resetWhen !== undefined) reset(); }, [resetWhen, reset]);
```

`reset` の `useCallback` 依存に `resetKey` を直接含めているため、`resetKey` の値が変わるたびに `reset` 自身の関数アイデンティティが変わる。`useEffect` の依存配列は `[resetWhen, reset]` であり、`reset` もその一部であるため、**`resetWhen`（絞り込み文字列）が変化していなくても、`reset` のアイデンティティが変わっただけでこの effect が再実行され、`reset()` が呼ばれてしまっていた**。並び替えの結果、一覧の先頭行（`tree[0]`）に別のノードが来ると `resetKey` の値が変わり、この誤発火が起きる。誤発火した `reset()` は intent を「新しい先頭行」へ上書きするため、並び替え直後に一瞬正しい選択（移動先）が描画された直後、先頭行へ選択が飛ぶ、という症状になっていた。

**横並び調査**：`useTreeEditSelection` は `useFavoriteEditSelection.ts`（お気に入り画面）と `useMemoManage.ts`（メモ画面）の両方から共有される唯一の選択基盤であり、両呼び出し元とも `resetKey` に「現在の一覧の先頭行の key」を渡している。そのため本バグは特定の操作（Ctrl+Shift+↓によるキーボード並び替え）に限らず、**一覧の先頭要素が入れ替わりうるあらゆる操作**（キーボードによる同一親内の並び替え・階層変更（インデント/アウトデント）・ドラッグ&ドロップによる並び替え・再親化・作成・削除等）と、**お気に入り画面・メモ画面の両方**で再現しうる構造的な欠陥と判定した。個別の操作・個別の画面ごとに再現確認して回るのではなく、原因（`useTreeEditSelection` 自身の実装）を直せば全操作・両画面に一括で及ぶと判断した。

**リファクタリング要否の判断**：原因は特定のアクション固有の実装ミスではなく、`useTreeEditSelection` という共有フック自体が持つ構造的な弱さ（「操作の副作用として変化する値」である `resetKey` を、`useCallback` の依存経由で間接的にリセットトリガーへ混入させていた）と判定した。[reset-triggers](#reset-triggers) で既に文書化されていた原則（reset トリガーの依存配列にはユーザーが新しい文脈に入ったことを示す値だけを含める）と同じ違反であり、対症療法（例：お気に入り画面の並び替えハンドラにだけ選択保持用のフラグを追加する）は同種の不具合を他の操作・メモ画面に温存するため見送り、共有フック1箇所の修正で解消した。

**対応**：`resetKey` を `useRef`（`resetKeyRef`）に持たせ、`reset` はこの ref から最新値を読むだけにして `useCallback` の依存配列を空にした。これにより `reset` のアイデンティティは `resetWhen` が変化しない限り安定し、`useEffect` は本来の意図通り `resetWhen` の変化のみをトリガーとする。`resetToTop()`（明示的な呼び出し）は従来通り呼び出し時点の最新 `resetKey` を使う（ref経由のため）。

**再発防止の検証項目**：お気に入り画面・メモ画面の双方で、キーボードによる並び替え（Ctrl+Shift+↑↓）・階層変更（Ctrl+Shift+←→）・マウスのドラッグ&ドロップによる並び替え・再親化のいずれについても、操作直後に選択が移動先の行に留まり続け、先頭行へ飛ばないことを確認する。

<a id="fallback-unsafe-async-select-jump"></a>

### 検索文字列変更直後、選択カーソルが無関係な行へ一瞬移動する（issue 0030 400工程・PO実機レビュー再修正）

**症状**：通常検索で非先頭の行（ピン止め行等）を選択した状態で検索文字列を変更すると、最新のファイル検索結果への置換が確定する前に、選択カーソルが保持中の（変更前の検索文字列に対する）直前検索結果の先頭ファイルへ一瞬移動し、その直後に正しい新しい一覧・選択へ切り替わる、という二段階の可視的な移動が発生した。

**直接原因**：選択解決用の唯一の `useLayoutEffect`（[選択モデル](#selection-is-derived)）は `rows` が変化するたびに実行される。`rows` はファイル検索結果（`results`。検索中は直前の完了結果を保持し続け、非同期にしか確定しない）とピン止めブロック等の固定候補（クエリの変化に対して同期的・即時に増減する。[同期的に確定する移動先と非同期でしか確定しない移動先](#sync-vs-async-restore)を参照）を連結した配列であり、クエリが空文字から非空文字へ変化した瞬間、ピン止めブロックだけが同一レンダー内で即座に消える。この時点でファイル検索結果側はまだ古いクエリに対する保持結果のままである。選択中の識別子がちょうど消えたピン止め行を指していた場合、`resolveSelected` は「見つからない」と判定し `fallback` を返すが、この時点の `fallback` に何を渡すかで結果が変わる。

当初実装（3188ee4）は通常検索ドメインで無条件に `fallback = 0`（先頭の選択可能項目）を使っており、上記の一瞬だけ選択が「保持中の直前検索結果の先頭（＝古いクエリに対する無関係なファイル）」へ移動する不具合を持っていた。1回目の修正（f28d351）は、検索が実行中・待機中（`searchBusyRef.current`）の間は `fallback = selectedFallbackRef.current`（直前にこの効果自身が解決した数値インデックス）を使うよう変更したが、これは[fallback に「直前のインデックス」を使ってよい条件](#fallback-unsafe-across-structural-change)の前提（items配列の構造が変化しない）を満たしていないケースに対する変更であり、根本原因を解消していなかった。ピン止め除去により配列の先頭側が縮むと、直前のインデックスは新しい配列上のずれた位置（保持中のファイル結果のどれか）を指すだけで、`0` を使うのと同様に無関係な行を指す。PO の再実機確認（アプリ再起動後）でも症状が解消していないことが確認され、再調査となった。

**横並び調査**：選択（`selected`/`intent`）を書き換える全箇所（`updateIntent` の全呼び出し・`setSelectedRaw` の全呼び出し）を確認したが、原因はいずれの「書き込み経路」にもなく、`rows`/`intent` の変化を検知して解決する唯一の `useLayoutEffect` が使う fallback 値の選び方にあった。`resolveSelected`（`selectIntent.ts`）自体の実装・契約（「見つからなければ fallback をそのまま返す」）に誤りはない。他の選択ドメイン（`clipboardMode`・`favoriteMode`・`recentMode`）の items（`clipboardSelectionItems`・`favoriteTree`）はいずれも、非同期にしか確定しない部分と同期的に即時更新される部分を同一配列内で混在させる構造を持たないため、直前のインデックスを fallback に使う既存の挙動で問題ない。したがって原因は通常検索ドメイン（`rows` 固有の構造）に限定され、`resolveSelected` 自体や他ドメインへの修正は不要と判定した。

**リファクタリング要否の判断**：個別の値の付け焼き刃な調整（fallbackの値をあれこれ変える）ではなく、「fallbackに直前のインデックスを使ってよい条件」という一般原則を本ファイルへ明文化した上で、通常検索ドメインの fallback 値算出だけをその原則に沿って修正した。原則自体は[fallback-unsafe-across-structural-change](#fallback-unsafe-across-structural-change)を参照。

**対応**：
1. 通常検索ドメイン（`!favoriteMode && !clipboardMode && !recentMode`）に限り、`searchBusyRef.current` が `true`（検索が実行中または待機中で、画面には直前に完了した保持結果がまだ表示されている間）は fallback に `-1`（選択なし）を使う。検索が完了し `searchBusyRef.current` が `false` に戻った時点（＝`results` の置換が確定し `rows` が最終形になった時点）で、この効果が `rows` の変化を検知して再実行され、そこで初めて `fallback = 0`（先頭の選択可能項目）を使う。`-1` の扱いは[fallback-unsafe-across-structural-change](#fallback-unsafe-across-structural-change)を参照（既存コードの `?? null`・`===` 一致比較・`Math.min`/`Math.max` クランプがそのまま `-1` を安全に扱うため、`ResultList.tsx`・`App.tsx` 側の変更は不要だった）。
2. 検索ディスパッチ本体（`searchBusyRef` を立てる本来の処理）は通常の `useEffect` であり、同一コミット内では `useLayoutEffect` より後に実行されるため、選択解決用 `useLayoutEffect` の初回実行時点では `searchBusyRef.current` がまだ `false` のまま（＝検索が実行中であることをまだ検知できない）という React のコミット順序上の制約があった。選択解決用 `useLayoutEffect` より前に宣言した専用の `useLayoutEffect` で `searchBusyRef` を先に立てることで解消した（`useLayoutEffect` 同士は宣言順に実行されるため、これが選択解決用より確実に先に走る。`startSearchBusy` 自身が多重起動防止のガードを持つため、後続の検索ディスパッチ側の呼び出しと二重にはならない）。

**再発防止の検証項目**：通常検索で、ピン止め行など非先頭の行を選択した状態から検索文字列を変更する操作を複数回行い、最新結果への置換が完了するまでの間、無関係な行（変更前のクエリに対する保持結果の先頭等）が一瞬でも選択・ハイライトされないことを確認する。あわせて、置換完了時点で識別子が新しい一覧に存在する場合は選択が維持され、存在しない場合は先頭の選択可能項目へ移ることを確認する。

## 今後の指針

- `selected` に相当する値を新設する場合、書き込み可能な state にしない。「意図」と「現在の候補一覧」から導出する設計を優先する
- 「次の1回だけ何かを抑止する」という時間依存の一度きりフラグを新設しない。抑止したい理由は常に「復元したい対象の識別子（intent）を保持しているかどうか」だけで判定できる
- reset トリガーの依存配列には"ユーザーが新しい文脈に入ったことを示す値"だけを含め、"その文脈内での操作の副作用として変化する値"を含めない。値そのものを直接含める場合だけでなく、その値に依存する `useCallback`/`useMemo` の戻り値（関数・オブジェクト）を間接的に含める場合も同じ違反になりうる（[tree-edit-selection-reset-key-identity-bug](#tree-edit-selection-reset-key-identity-bug)を参照）。値が変化しても関数のアイデンティティを変えたくない場合は、値を `useRef` に持たせて関数側は依存配列に含めない
- 新機能・新モードを追加する際、そのモード専用の強制リセットeffectを新設しない。選択のリセットは常に汎用トリガーだけに一本化し、それ以外のデータ変化は `resolveSelected` の fallback 挙動に委ねる
- 選択中の行の種類の判定は常に `rows[selected].kind` で行い、個別のオフセット変数を新設しない。新しい行の種類を追加する場合も、まず `ResultRow` に新しい `kind` を追加して `rows` の構築ロジック（`useSearch.ts` の1箇所）に組み込み、`App.tsx`/`ResultList.tsx` 側は switch に case を1つ追加するだけで対応できる状態を維持する
- 結果行のルート要素は `<div role="button">` のまま維持し、`<button>` に戻さない。新しい操作ボタンを行に追加する場合はこの構造の上に乗せる。**この規約は `ResultList.tsx` の `rows.map` 由来の行に限らず、選択可能な一覧行を描画するコンポーネント全て（プレフィックスコマンド候補・Web検索行・パス貼り付けウィザードのフォルダ選択候補・クリップボード履歴一覧等）に適用する**（[row-focus-retention-bug](#row-focus-retention-bug) を参照）。新しい一覧・候補リストを追加する場合、行が複数の内部操作ボタンやドラッグ&ドロップ等の個別事情を持たないなら、まず共通ラッパー `SelectableRow`（[selectable-row-wrapper](#selectable-row-wrapper)）が使えないか検討し、使えない場合のみ `<div role="button">` を直接書く
- 結果行に区切り線（`border-b`/`border-t`）は使わない。区切りが必要になった場合は背景色差のみで表現する
- 一覧・ツリーの行操作（開閉トグル・リネーム開始等）を window レベルの `keydown` リスナーでEnterを処理する画面を新設する場合、`event.target instanceof HTMLButtonElement` の間はガードして行操作を発火させない。行内・ヘッダーの操作ボタン（`IconSlot` 等）へTabでフォーカスした状態のEnterは、ボタン自身の `click`（ブラウザ標準の確定経路）に一本化し、window レベル側と二重発火させない（[window-level-enter-vs-focused-button-bug](#window-level-enter-vs-focused-button-bug)を参照）
