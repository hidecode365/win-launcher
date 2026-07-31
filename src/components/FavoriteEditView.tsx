import { Tooltip } from "./Tooltip";

// お気に入り編集ビュー（軸4a：骨格のみ）。フォルダの作成・削除・リネーム・
// ドラッグ&ドロップによる並び替えは 4b 以降で実装する
// （REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
//
// ヘッダーの構成（戻るボタン＋タイトル＋ドラッグ領域）は SettingsPanel.tsx と
// 同じパターンを踏襲する。
//
// 「検索」「設定」に続く3枚目のビューとして、App.tsx の view state 切り替えのみで
// 表示する（新規のOSウィンドウは作らない）。useSearch/useSettings 自体はこの
// ビューを開いてもアンマウントされないため、閉じて /favorite ブラウジングへ戻った
// 際の絞り込み文字列・選択位置・フォルダ展開状態の保持は、この仕組み自体から自動的に
// 得られる（専用の保存・復元コードをここに持たせる必要はない）。
export function FavoriteEditView({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
      <div
        data-tauri-drag-region="deep"
        className="flex items-center px-4 py-3 border-b border-gray-200/60"
      >
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </Tooltip>
        <span className="text-base font-medium text-gray-800">
          お気に入りの編集
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        準備中です
      </div>
    </div>
  );
}
