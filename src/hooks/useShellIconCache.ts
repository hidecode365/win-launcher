import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// issue 0031：Shellアイコンの表示範囲優先取得。
//
// 通常検索・ピン止め・お気に入り・`/recent`の4経路が共有する、パスをキーにした
// アイコン取得キャッシュ。`resolve_icon`（Rust側）の結果はパスだけに依存し、検索
// 文字列・画面モード・取得時刻には依存しないため、1つのパスのアイコンはどの画面・
// どの検索文字列から要求されても同じ結果になる。そのため画面横断でキャッシュを
// 共有してよく、「検索文字列変更・画面切替・再取得で古くなった要求の結果を現在の
// 一覧へ反映しない」という要件は、パスをキーにした素朴なキャッシュとして実現できる
// （行の識別子や検索世代を別途持ち回る必要がない。詳細は`docs/internal-design/`の
// 該当節・DESIGN_LOG.md「Shellアイコンの表示範囲優先取得と検索打ち切り案内」を参照）。
//
// 同時実行数は1に固定する（Shell APIを複数スレッドから同時に呼び出す安全性が
// 未検証のため。先読み件数は呼び出し側が指定する）。1回のバッチ取得は
// `get_icons_for_paths`（既存の汎用アイコン取得コマンド）を1回呼ぶだけで、
// 複数の`invoke`を並行発行しない。

// 表示中の行の直後に先読みする件数（外部設計06・DESIGN_LOG.mdの初期案）。
// 通常検索・ピン止め・お気に入り・`/recent`の4経路で共通の固定値とし、
// 利用者向け設定にはしない。
export const SHELL_ICON_LOOKAHEAD = 8;

export interface ShellIconCache {
  // 指定パスの取得済みアイコンを返す。未取得・未要求の場合は`undefined`。
  getIcon: (path: string) => string | null | undefined;
  // 表示中の行＋先読み分のパスを要求する。既に取得済み・取得中のパスは無視する。
  requestIcons: (paths: string[]) => void;
}

export function useShellIconCache(): ShellIconCache {
  // path -> アイコン（取得失敗時は null）。Reactの再レンダーをトリガーしない
  // 素のMapとして保持し、更新のたびに`version` state を1つ進めて再レンダーを促す
  // （Mapの中身自体をstateに持たせて丸ごと差し替えると、大量パスの取得が続く間、
  // 差分のない新しいMapを都度生成するコストが乗るため）。
  const cacheRef = useRef<Map<string, string | null>>(new Map());
  // 取得済み・取得要求済みのパス（再要求しないための集合）。
  const pendingRef = useRef<Set<string>>(new Set());
  // まだ取得を開始していない待機中のパス。
  const queueRef = useRef<string[]>([]);
  const fetchingRef = useRef(false);
  const [, setVersion] = useState(0);

  const runQueue = useCallback(() => {
    if (fetchingRef.current) return;
    if (queueRef.current.length === 0) return;
    const batch = queueRef.current;
    queueRef.current = [];
    fetchingRef.current = true;
    invoke<(string | null)[]>("get_icons_for_paths", { paths: batch })
      .then((icons) => {
        icons.forEach((icon, i) => {
          cacheRef.current.set(batch[i], icon ?? null);
        });
        setVersion((v) => v + 1);
      })
      .catch((err) => {
        console.error("[shellIconCache] get_icons_for_paths failed:", err);
        // 失敗したパスもpendingへ残したまま無限再試行はしない（既存の種類/汎用
        // アイコンフォールバックのまま表示を続ける。DESIGN_LOG.md記載の方針）。
      })
      .finally(() => {
        fetchingRef.current = false;
        // 取得中に新たに要求されたパスがキューへ積まれていれば続けて処理する
        // （同時実行数1を保ったまま、表示範囲の変化を追いかける）。
        runQueue();
      });
  }, []);

  const requestIcons = useCallback(
    (paths: string[]) => {
      let added = false;
      for (const path of paths) {
        if (pendingRef.current.has(path)) continue;
        pendingRef.current.add(path);
        queueRef.current.push(path);
        added = true;
      }
      if (added) runQueue();
    },
    [runQueue]
  );

  const getIcon = useCallback(
    (path: string) => cacheRef.current.get(path),
    []
  );

  return { getIcon, requestIcons };
}
