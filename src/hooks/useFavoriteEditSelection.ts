import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  resolveSelected,
  SelectIntent,
} from "../lib/selectIntent";
import type { FavoriteTreeRow } from "../types";

// お気に入り編集ビュー専用の選択状態。/favorite ブラウジング側（useSearch.ts）の
// 選択状態とは独立したドメインとして持つ（REQUIREMENTS.md「お気に入り編集ビュー」
// 節）。実装方式は useSearch.ts の SelectIntent と同じ「識別子ベースの intent から
// resolveSelected で毎回導出する」方式に最初から従う（R-1の原則。CLAUDE.md
// 「選択(selected)は...導出する値であり、書き込み可能なstateではない」を参照）。
// 4c（削除）でフォルダ削除に伴う非同期のデータ再取得が発生した際、行番号ベースの
// 選択管理だと対象がずれるが、この方式なら選択管理を作り直さずに済む。
//
// useSearch.ts の同種の仕組みと異なり、ホバー抑制（直近キーボード操作からの猶予・
// カーソル静止判定）・expiresAt によるタイムアウトフォールバックは持たせていない。
// 編集ビューは常時全件表示のツリーで、ブラウジング側のように非同期の一覧差し替え
// （検索結果の到着等）と選択操作が競合する場面が無いため簡略化している。
// 4c（作成・削除）では、作成後の選択移動は selectByKey（intent は期限なしのため、
// favoriteTree が非同期更新で新規フォルダを含むまで待ち続け、含まれた時点で自動的に
// 解決される）、削除後の選択復元は resetToTop（複数階層・複数件をまたぐ削除のため
// 「次の1件」を一意に定義できず、先頭へのフォールバックでよい）で対応しており、
// いずれも expiresAt 付き intent を必要としなかった。
export function useFavoriteEditSelection(tree: FavoriteTreeRow[]) {
  const [intent, setIntent] = useState<SelectIntent>({ type: "top" });
  const [selected, setSelected] = useState(0);
  const fallbackRef = useRef(0);

  useLayoutEffect(() => {
    const resolved = resolveSelected(intent, tree, fallbackRef.current);
    fallbackRef.current = resolved;
    setSelected(resolved);
  }, [intent, tree]);

  const selectByKey = useCallback((key: string) => {
    setIntent({ type: "key", key });
  }, []);

  // フォルダ削除（4c）後の選択復元用。複数階層・複数件をまたぐ削除のため
  // 「次に選ぶべき1件」を一意に定義できず、先頭へのフォールバックでよい
  // （R-1の既存の正当な例外パターン。useSearch.ts の performRemoveFavoriteFolder
  // 「onRemoved」デフォルト実装と同じ考え方）。
  const resetToTop = useCallback(() => {
    setIntent({ type: "top" });
  }, []);

  // ↑↓キーによる選択移動。フォルダ見出し行・アイテム行の両方を対象にする
  // （軸1で /favorite ブラウジングに実装した内容と同じ設計。REQUIREMENTS.md
  // 「お気に入り編集ビュー」節を参照）。App.tsx の moveSelection と同じく、
  // 現在の resolved 値（selected）をそのまま起点にする。
  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      const nextIndex =
        direction === 1
          ? Math.min(selected + 1, tree.length - 1)
          : Math.max(selected - 1, 0);
      const row = tree[nextIndex];
      if (row) {
        setIntent({ type: "key", key: row.key });
      }
    },
    [selected, tree]
  );

  return { selected, selectByKey, moveSelection, resetToTop };
}
