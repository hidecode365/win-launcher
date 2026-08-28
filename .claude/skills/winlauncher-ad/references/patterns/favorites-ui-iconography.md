# ピン止め・お気に入りアイコンとツールチップ

→ 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md)

- 一覧の全項目が登録済みであることが自明な文脈（ピン止めブロック・`/favorite` 一覧）では、★・ピンアイコンは選択中（selected）のときのみ表示する。 → 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md#toggle-icon-visibility)
- トグルアイコンの状態（登録済み/未登録）は色ではなく形状（輪郭／塗りつぶし）で表現する。色は行の文字色（`currentColor`）に追従させるだけにする。単色シルエットは二色構成よりサイズを一段下げることを検討する。 → 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md#toggle-icon-shape-and-color)
- アイコンは単色を一律適用せず、行が取りうる3状態（通常／選択中／グレーアウト）ごとに個別にコントラストを検証する。「視覚的に目立たせたい要素」と「控えめにしたい要素」が同じ行に混在する場合、`opacity` は控えめにしたい要素側だけに付与する。 → 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md#warning-icon)
- 新しい操作アイコンにツールチップを付ける場合は必ず `Tooltip` 共通コンポーネントを使い、`title` 属性を使わない（「省略テキストの全体表示」目的の場合のみ `title` 属性を許容）。 → 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md#tooltip-component)
- 新しい行末アイコン（ピン・★・件数バッジ・フォルダ作成・削除等）を追加する場合は必ず共通ラッパー `IconSlot` を使い、個々のコンポーネントが独自の `ml-2`・ホバー円・Tooltipラップを実装しない。余白はアイコン群を束ねる親要素の `gap-2` に一本化する。「サイズ・マージンの数値は揃えたのに見た目が揃わない」という報告を受けた場合、数値の再調整より先に各要素の実際のDOM構造（パディングの有無・ラッパーの層数）の違いを疑う。 → 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md#icon-slot-wrapper)
- 新しい行頭アイコン（フォルダ／ファイル種別アイコン）を追加する場合は、行の構造（チェブロンの有無）に応じて`HEADING_ROW_ICON_CLASS`／`CONTENT_ROW_ICON_CLASS`（`FavoriteTreeVisuals.tsx`）を使い、生のマージン値を個別にコピーしない。チェブロンを持たずドラッグハンドルの直後にアイコンが来る行のアイコンには左マージンを付けない（ドラッグハンドル自身のマージンと二重に加算される）。常にフォールバック表示になる行のアイコンには`opacity-60`を付ける。 → 詳細: [favorites-ui-iconography.md](../../../../../docs/internal-design/favorites-ui-iconography.md#heading-and-content-row-icon-class)
