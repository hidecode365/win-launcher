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
// （検索結果の到着等）と選択操作が競合する場面が無いため、今回のスコープ（4b：
// 読み取り専用のツリー表示＋選択）では簡略化している。4c（削除）で非同期の
// データ再取得を伴う操作が入った時点で、必要であれば expiresAt 付き intent を
// 追加する。
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

  return { selected, selectByKey, moveSelection };
}
