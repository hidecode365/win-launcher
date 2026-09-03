import { ExcludedFile } from "../types";

// 「除外されたファイル」リンク押下時にフォルダ情報ダイアログ（FolderInfoModal）の
// 上へ重ねて表示するモーダル。データは呼び出し元（FolderInfoModal）が既に
// get_search_folder_info で取得済みの SearchFolderInfo.excludedFiles をそのまま
// 渡すだけで、この画面自身は追加のinvokeを行わない（外部設計「除外ファイル一覧
// ダイアログ」節「リンク押下時に追加のファイルシステム走査を行わない」を参照）。
//
// 開閉状態は呼び出し元（FileSearchSettings.tsx）が持つ（このコンポーネント自身は
// ローカルstateを持たない）。Escapeの処理も呼び出し元の一元化された優先順位
// チェーンに委ね、このコンポーネント自身はキーイベントを購読しない
// （internal-design/result-list-and-selection.md の「windowレベルのキー処理は
// 1箇所に集約する」原則を踏襲。FolderInfoModal と同じ設計）。
export function ExcludedFilesModal({
  files,
  truncated,
  onClose,
}: {
  files: ExcludedFile[];
  truncated: boolean;
  onClose: () => void;
}) {
  return (
    // FolderInfoModal（z-10）の上に重ねるため z-20。背景ディムは重ねて表示され、
    // 下のフォルダ情報ダイアログはそのまま保持される（隠さず、操作対象からも外す）。
    <div className="absolute inset-0 z-20 flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
      {/* 400工程レビュー指摘（是正）：POの意図は「除外されたファイル」一覧モーダルを
          従来幅（w-96=24rem）の約1.5倍（36rem）へ拡大することであり、フォルダ情報
          ダイアログ（FolderInfoModal）側ではない。フォルダ情報ダイアログは従来幅
          （w-96）へ戻し、この一覧モーダルだけを拡大する。ウィンドウは640px幅まで
          縮小できるため（tauri.conf.jsonのminWidth）、`max-w-full`で親（設定画面の
          コンテンツ領域）の幅を超えないようにし、外側に`px-4`を加えて狭い画面でも
          左右の余白を確保する。 */}
      <div className="w-[36rem] max-w-full max-h-[85%] flex flex-col rounded-xl bg-white p-5 shadow-2xl">
        <div className="text-sm font-medium text-gray-800 flex-shrink-0">
          除外されたファイル
        </div>
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200/60">
          {files.length === 0 ? (
            <div className="py-3 text-sm text-gray-400">
              除外されたファイルはありません
            </div>
          ) : (
            files.map((f) => (
              <div key={f.path} className="py-2">
                <div className="text-sm text-gray-800 break-all">{f.name}</div>
                <div className="text-xs text-gray-400 break-all">{f.path}</div>
              </div>
            ))
          )}
        </div>
        {truncated && (
          <div className="mt-2 text-xs text-amber-600 flex-shrink-0">
            除外されたファイルは200件を超えるため、先頭200件のみ表示しています。
          </div>
        )}
        <div className="mt-4 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
