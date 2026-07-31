import { useRef } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { Tooltip } from "./Tooltip";
import { WarningIcon } from "./ToggleIcons";
import {
  FolderChevron,
  FileIcon,
  FOLDER_ICON_PATH,
  TRASH_ICON_PATH,
  INDENT_STEP_REM,
  INDENT_BASE_REM,
} from "./FavoriteTreeVisuals";
import { FavoriteTreeRow } from "../types";

// お気に入り編集ビューのツリー表示。走査結果（tree）自体は /favorite ブラウジング
// （FavoriteListPanel.tsx）と同じ favoriteTree をそのまま参照し、折りたたみ状態も
// 共有する（新規のツリー走査・折りたたみロジックは持たない。CLAUDE.md「同じ走査
// ロジックを2箇所に持たない」原則を参照）。行の見た目（チェブロン・フォルダ
// アイコン・インデント幅・ファイルアイコン・削除アイコン）は FavoriteTreeVisuals.tsx
// を共有する。
//
// FavoriteListPanel.tsx との違い：★トグル・「上へ/下へ移動」・ドラッグハンドルは
// 表示しない（4d〜4eで対応予定。REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
// 削除アイコンはフォルダ見出し行のみ、かつ選択中の行にのみ表示する（アイテム行の
// 削除・登録解除は /favorite ブラウジング側の★トグルのみで行う対象のため、この
// ビューには持たせない）。予約フォルダ（ピン止め・お気に入り・メモ）はこの
// tree（favoriteTree は「お気に入り」フォルダの子孫のみを列挙する）に現れないため、
// 予約フォルダ向けの削除アイコン非表示判定は別途不要（Rust側 remove_favorite_folder
// も二重に防御している）。
// アイテム行はクリック／Enterのいずれでもファイルを起動しない（このビューは
// ファイルを起動する画面ではなく、構造を閲覧・整理する画面のため）。
export function FavoriteEditTree({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  onRequestDeleteFolder,
}: {
  tree: FavoriteTreeRow[];
  // tree（favoriteTree）上の選択インデックス。フォルダ見出し行・アイテム行の
  // 両方が対象（useFavoriteEditSelection.ts を参照）。
  selected: number;
  onSelectRowByKey: (key: string) => void;
  onToggleCollapse: (folderId: string) => void;
  onRequestDeleteFolder: (folderId: string, name: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {tree.length === 0 && (
        <div className="flex items-center justify-center text-gray-400 text-sm py-6">
          ★ボタンでファイルを登録すると、ここに表示されます
        </div>
      )}
      {tree.map((row, index) => {
        const indentStyle = {
          paddingLeft: `${row.depth * INDENT_STEP_REM + INDENT_BASE_REM}rem`,
        };
        const isSelected = index === selected;

        if (row.kind === "folder") {
          return (
            <div
              key={row.key}
              role="button"
              data-index={index}
              style={indentStyle}
              className={`w-full flex items-center py-2 pr-2 text-left transition-colors ${
                isSelected
                  ? "bg-blue-500 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
              onClick={() => onToggleCollapse(row.node.id)}
              onMouseEnter={() => onSelectRowByKey(row.key)}
            >
              <FolderChevron collapsed={row.collapsed} />
              <svg
                className="w-4 h-4 ml-1.5 mr-2 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d={FOLDER_ICON_PATH} />
              </svg>
              <span className="text-xs font-medium truncate flex-1">
                {row.node.name}
              </span>
              <span
                className={`ml-2 flex-shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] ${
                  isSelected
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {row.directChildCount}
              </span>
              {/* 削除アイコン。選択中の行にのみ表示する（ピン・★アイコンの
                  「選択時のみ表示」と同じ考え方）。行全体のクリック（折りたたみ
                  切替）に伝播させないよう stopPropagation する。 */}
              {isSelected && (
                <Tooltip label="このフォルダを削除" className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDeleteFolder(row.node.id, row.node.name);
                    }}
                    className="ml-1 p-1 rounded text-white/80 hover:bg-white/20"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={TRASH_ICON_PATH}
                      />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>
          );
        }

        const item = row.file;
        return (
          <div
            key={row.key}
            data-index={index}
            style={indentStyle}
            className={`w-full flex items-center py-2.5 pr-4 text-left transition-colors ${
              isSelected
                ? "bg-blue-500 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onMouseEnter={() => onSelectRowByKey(row.key)}
          >
            <div
              className={`flex items-center min-w-0 flex-1 ${
                !row.exists ? "opacity-50" : ""
              }`}
            >
              {item.icon ? (
                <img
                  src={item.icon}
                  alt=""
                  className="w-4 h-4 mr-3 flex-shrink-0"
                />
              ) : (
                <FileIcon className="w-4 h-4 mr-3 flex-shrink-0 opacity-60" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {item.name}
                </div>
                <div
                  className={`text-xs truncate ${
                    isSelected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {item.path}
                </div>
              </div>
            </div>
            {!row.exists && <WarningIcon selected={isSelected} />}
          </div>
        );
      })}
    </div>
  );
}
