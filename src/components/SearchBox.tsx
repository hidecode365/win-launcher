import type { ClipboardEvent, RefObject } from "react";
import { SettingsButton } from "./SettingsButton";

export function SearchBox({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  disabled,
  onOpenSettings,
  onImagePaste,
  onPathPaste,
}: {
  inputRef: RefObject<HTMLInputElement>;
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  onOpenSettings: () => void;
  onImagePaste?: (file: File) => void;
  onPathPaste?: () => void;
}) {
  // 画像は既存通り preventDefault してプレビューへ差し替える。それ以外の貼り付けは
  // 通常のテキスト貼り付け動作を妨げず、並行して Rust 側に CF_HDROP の有無を確認させる
  // （CF_HDROP はブラウザの clipboardData に実パスとして現れないため、確認は常に
  // Rust 側で実クリップボードを直接読み直す方式にしている）。CF_HDROP が単一パスの
  // 場合はそのパス文字列を検索ボックスへ流し込み、以降は通常のテキスト貼り付け・
  // 手入力と同じ経路で実在パス判定を行う。詳細は `useSearch.ts` の
  // `detectPastedPath`/`read_pasted_hdrop_path` コマンドを参照。
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/") && onImagePaste) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) onImagePaste(file);
          return;
        }
      }
    }
    onPathPaste?.();
  };

  return (
    <div
      data-tauri-drag-region="deep"
      className="flex items-center px-4 py-3 border-b border-gray-200/60"
    >
      <svg
        className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        placeholder="検索..."
        className="flex-1 bg-transparent outline-none text-lg text-gray-800 placeholder-gray-400 read-only:opacity-50"
        autoComplete="off"
        spellCheck={false}
        readOnly={disabled}
      />
      {/* 検索ボックスの右端に位置し左側に十分な余白があるため、Tooltip の
          既定（左側表示）のままでよい。 */}
      <SettingsButton onOpenSettings={onOpenSettings} className="ml-2" />
    </div>
  );
}
