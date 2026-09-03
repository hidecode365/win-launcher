import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderEntry, SearchFolderInfo } from "../types";
import { ExcludedFilesModal } from "./ExcludedFilesModal";

// 情報取得は通常ファイル検索と別の実行状態・世代管理で動かす（CLAUDE.md「検索
// フォルダ情報ダイアログ」節を参照）。generationRef はこのモーダル専用のローカル
// カウンタで、Rust側の `FOLDER_INFO_GENERATION`（通常検索の `SEARCH_GENERATION` とは
// 独立）と同じ番号を共有する。ダイアログを閉じる（unmount）・対象フォルダが変わる
// （folder.path の変化）のいずれでも、cleanup で新しい世代番号を即座に通知し、
// 走査中の旧要求をobsolete化する。

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-800 mb-1">{label}</div>
      <div className="text-sm text-gray-700">{value}</div>
    </div>
  );
}

function formatMaxDepth(info: SearchFolderInfo): string {
  return info.maxDepthExceedsMax ? "20階層以上" : `${info.maxDepthReached}階層`;
}

export function FolderInfoModal({
  folder,
  onClose,
  excludedFilesOpen,
  onExcludedFilesOpenChange,
}: {
  folder: FolderEntry;
  onClose: () => void;
  // 「除外されたファイル」サブモーダルの開閉状態。呼び出し元（FileSearchSettings.tsx）が
  // 保持し、Escapeの優先順位チェーン（一覧モーダル→フォルダ情報ダイアログの順に
  // 閉じる）へ組み込む。このコンポーネント自身はローカルstateを持たない
  // （詳細は CLAUDE.md「除外ファイル一覧ダイアログ」節を参照）。
  excludedFilesOpen: boolean;
  onExcludedFilesOpenChange: (open: boolean) => void;
}) {
  const [info, setInfo] = useState<SearchFolderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setInfo(null);
    setError(null);
    setLoading(true);
    invoke<SearchFolderInfo>("get_search_folder_info", {
      generation,
      path: folder.path,
    })
      .then((result) => {
        if (generationRef.current !== generation) return;
        setInfo(result);
        setLoading(false);
      })
      .catch((err) => {
        if (generationRef.current !== generation) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      const nextGeneration = generationRef.current + 1;
      generationRef.current = nextGeneration;
      invoke("set_folder_info_generation", { generation: nextGeneration }).catch(
        () => {}
      );
    };
  }, [folder.path]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-96 rounded-xl bg-white p-5 shadow-2xl">
        <div className="text-sm font-medium text-gray-800">フォルダ情報</div>
        <div className="mt-0.5 text-xs text-gray-400 break-all">
          {folder.path}
        </div>

        {error ? (
          <div className="mt-4 pt-3 border-t border-gray-200/60 text-sm text-red-500">
            {error}
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-gray-200/60 space-y-3">
            <div className="text-xs text-gray-400">
              集計対象は対象フォルダ直下を1階層目とした20階層までです。
            </div>
            <InfoRow
              label="最大フォルダ階層数"
              value={loading || !info ? "確認中…" : formatMaxDepth(info)}
            />
            <InfoRow
              label="全ファイル数"
              value={loading || !info ? "確認中…" : `${info.totalFileCount}件`}
            />
            <InfoRow
              label="現在の設定で検索対象となるファイル数"
              value={
                loading || !info ? "確認中…" : `${info.filteredFileCount}件`
              }
            />
          </div>
        )}

        {!loading && !error && info?.partialError && (
          <div className="text-xs text-amber-600 mt-3">
            一部の項目を確認できませんでした
          </div>
        )}

        {!loading && !error && info && (
          <button
            type="button"
            onClick={() => onExcludedFilesOpenChange(true)}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700"
          >
            除外されたファイル
          </button>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>
      </div>

      {excludedFilesOpen && info && (
        <ExcludedFilesModal
          files={info.excludedFiles}
          truncated={info.excludedFilesTruncated}
          onClose={() => onExcludedFilesOpenChange(false)}
        />
      )}
    </div>
  );
}
