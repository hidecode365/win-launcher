import { useMemo } from "react";
import { useTreeEditSelection } from "./useTreeEditSelection";
import { type FavoriteEditTreeRow, type FavoriteTreeRow } from "../types";

// お気に入り編集ビュー専用の選択状態。/favorite ブラウジング側（useSearch.ts）の
// 選択状態とは独立したドメインとして持つ（00-requirements.md「お気に入り編集ビュー」
// 節）。実装方式は useSearch.ts の SelectIntent と同じ「識別子ベースの intent から
// resolveSelected で毎回導出する」方式に最初から従う（R-1の原則。CLAUDE.md
// 「選択(selected)は...導出する値であり、書き込み可能なstateではない」を参照）。
// 4c（削除）でフォルダ削除に伴う非同期のデータ再取得が発生した際、行番号ベースの
// 選択管理だと対象がずれるが、この方式なら選択管理を作り直さずに済む。
//
// useTreeEditSelection は useSearch.ts と同じく、キーボード選択とホバー選択の入口を
// 分離する。並び替え・再親化後の再描画で、静止したカーソル直下へ移動してきた行の
// onMouseEnter が移動対象の選択intentを上書きしないためである。
// expiresAt によるタイムアウトフォールバックは、必要な呼び出しだけが指定する。
// 4c（作成・削除）では、作成後の選択移動は selectByKey（intent は期限なしのため、
// favoriteTree が非同期更新で新規フォルダを含むまで待ち続け、含まれた時点で自動的に
// 解決される）、削除後の選択復元は resetToTop（複数階層・複数件をまたぐ削除のため
// 「次の1件」を一意に定義できず、先頭へのフォールバックでよい）で対応しており、
// いずれも expiresAt 付き intent を必要としなかった。
//
// issue 0026（メモ・お気に入り画面を管理画面ベースへ統合）軸B：200_設計工程で
// 決定した通り、仮想固定行「Top」（external-design/03-data-model.md
// #favorite-edit-virtual-root-row）は撤去した。ルート直下への新規フォルダ作成は
// 常にヘッダーのアイコン（FavoriteEditView.tsx）から行い、選択の初期値・
// リセット先は「先頭の実データ行」（無ければ空センチネル）にする。
export function useFavoriteEditSelection(
  rawTree: FavoriteTreeRow[],
  filterText: string
) {
  const tree = useMemo<FavoriteEditTreeRow[]>(() => rawTree, [rawTree]);
  const resetKey = tree[0]?.key ?? "__favorite_empty__";
  const selection = useTreeEditSelection(tree, resetKey, filterText);
  return { tree, ...selection };
}
