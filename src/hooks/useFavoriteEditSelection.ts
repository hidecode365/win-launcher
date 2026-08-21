import { useMemo } from "react";
import { useTreeEditSelection } from "./useTreeEditSelection";
import {
  FAVORITE_TOP_ROW_KEY,
  type FavoriteEditTreeRow,
  type FavoriteTreeRow,
} from "../types";

// 仮想行「Top」（00-requirements.md「お気に入り編集ビュー」節）。実体を持たないため
// `node` フィールドを持たない専用の kind として types.ts の FavoriteEditTreeRow で
// 定義している。他の行と同様 `key` を持つことで、選択状態（intent）・↑↓移動・
// resolveSelected の対象に一切の特別扱いなしで組み込める。
const TOP_ROW: FavoriteEditTreeRow = { kind: "top", key: FAVORITE_TOP_ROW_KEY };

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
export function useFavoriteEditSelection(
  rawTree: FavoriteTreeRow[],
  filterText: string
) {
  // 仮想行「Top」を先頭に合成した、編集ビューの選択ドメインが実際に扱う一覧。
  // /favorite ブラウジング側の favoriteTree（rawTree）自体は変更しない
  // （Top は編集ビュー専用の概念のため、共有データソースを汚染しない）。
  const tree = useMemo<FavoriteEditTreeRow[]>(() => [TOP_ROW, ...rawTree], [rawTree]);
  // intent.type === "top" は常にインデックス0（＝仮想行「Top」自身）を指す。
  // 初期選択・削除後のフォールバック（resetToTop）が「Topを選択する」という
  // 意味に一致するため、既存の resolveSelected の実装を変更せず自然に組み込める。
  const selection = useTreeEditSelection(tree, FAVORITE_TOP_ROW_KEY, filterText);
  return { tree, ...selection };
}
