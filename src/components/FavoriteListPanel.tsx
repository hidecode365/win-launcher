import { useRef } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { Tooltip } from "./Tooltip";
import { WarningIcon, FavoriteToggleButton } from "./ToggleIcons";
import {
  FolderChevron,
  FileIcon,
  FOLDER_ICON_PATH,
  INDENT_STEP_REM,
  INDENT_BASE_REM,
} from "./FavoriteTreeVisuals";
import { FavoriteTreeRow, FileEntry } from "../types";

// フォルダ削除アイコン。FileSearchSettings.tsx の「このフォルダを検索対象から
// 削除」ボタンと同じゴミ箱アイコン・配色（グレー→ホバーで赤）を流用し、既存の
// 削除操作の見た目に揃える。
const TRASH_ICON_PATH =
  "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

// 「上へ移動」「下へ移動」用のシェブロンアイコン（Heroicons outline の
// chevron-up/chevron-down）。段階3のドラッグ&ドロップ実装までの暫定手段のため、
// 意匠に凝らず既存の他アイコンと同じ線画スタイルのものをそのまま使う。
const CHEVRON_UP_PATH = "M4.5 15.75l7.5-7.5 7.5 7.5";
const CHEVRON_DOWN_PATH = "M19.5 8.25l-7.5 7.5-7.5-7.5";

// 「上へ移動」「下へ移動」ボタン。フォルダ見出し行・アイテム行の両方から使う
// 共通部品。先頭/末尾では disabled にする（依頼内容に基づく：一番上/一番下の
// ノードではそれぞれ無効化する）。行全体の onClick（折りたたみ切替・起動）に
// 伝播させないよう stopPropagation する。
//
// アイテム行は選択中に青背景（bg-blue-500）になるため、フォルダ見出し行と同じ
// 固定のグレー配色だと選択時に視認できなくなる。`selected` を受け取り、
// ToggleIcons.tsx の PinToggleButton 等と同じ考え方（選択中は白、非選択中は
// グレー）で色を切り替える（軸1でフォルダ見出し行も選択対象になったため、
// 呼び出し側はフォルダ見出し行・アイテム行のどちらでも実際の選択状態を渡す）。
function MoveButton({
  direction,
  disabled,
  selected,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const colorClass = disabled
    ? selected
      ? "text-white/30 cursor-default"
      : "text-gray-200 cursor-default"
    : selected
      ? "text-white/80 hover:bg-white/20"
      : "text-gray-400 hover:text-gray-700 hover:bg-gray-100";
  return (
    <Tooltip
      label={direction === "up" ? "上へ移動" : "下へ移動"}
      className="flex-shrink-0"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
        className={`p-1 rounded ${colorClass}`}
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
            d={direction === "up" ? CHEVRON_UP_PATH : CHEVRON_DOWN_PATH}
          />
        </svg>
      </button>
    </Tooltip>
  );
}

// フォルダの折りたたみ・展開を示す▼/▶アイコン、フォルダアイコン、インデント幅は
// FavoriteTreeVisuals.tsx（お気に入り編集ビューと共有）を参照。

// /favorite モードの一覧（フォルダ見出し行＋アイテム行のツリー表示）。REQUIREMENTS.md
// 「お気に入り機能」節「/favorite モード」「/favorite モードでの★アイコン」を参照。
//
// ResultList.tsx とは別の専用コンポーネントにしている理由：ResultList の
// `rows: ResultRow[]` はフラットな1階層の判別可能 Union であり、フォルダ見出し行
// （選択不可・インデントの起点）という概念を持たない。ツリー構造を無理に既存の
// Union へ押し込めるより、ClipboardPanel.tsx・PathPasteWizard.tsx と同様に
// モード専用の描画コンポーネントとして独立させる方が既存の設計と一貫する。
export function FavoriteListPanel({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  onToggleFavorite,
  onLaunchFile,
  onRequestDeleteFolder,
  onMoveNode,
}: {
  tree: FavoriteTreeRow[];
  // tree 上の選択インデックス（フォルダ見出し行・アイテム行の両方が対象。軸1で
  // アイテム行専用の番号から拡張した。詳細は FavoriteTreeRow の型コメントを参照）。
  selected: number;
  onSelectRowByKey: (key: string, clientX: number, clientY: number) => void;
  onToggleCollapse: (folderId: string) => void;
  onToggleFavorite: (file: FileEntry) => void;
  onLaunchFile: (path: string) => void;
  // フォルダ削除（動作確認用の最小限のコア機能。段階3の本格的なツリー編集UIの
  // 前倒しではない）。確認要否の判定・実際の削除呼び出しは呼び出し側
  // （useSearch.ts）が行うため、ここではフォルダIDと表示名を渡すだけでよい。
  onRequestDeleteFolder: (folderId: string, name: string) => void;
  // 「上へ移動」「下へ移動」（段階3のドラッグ&ドロップ実装までの暫定手段）。
  // フォルダ見出し行・アイテム行のどちらからも同じコールバックを使う。
  onMoveNode: (id: string, direction: "up" | "down") => void;
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
        // インデント幅はフォルダ見出し行・アイテム行で共通の1段あたりの量とする
        // （REQUIREMENTS.md「フォルダ配下のアイテム行はインデントを1段下げる」。
        // 階層は depth のみで表現し、種別ごとに基準位置をずらさない。同じ depth の
        // フォルダ見出し行とアイテム行は兄弟として同じ横位置から始まる）。
        const indentStyle = {
          paddingLeft: `${row.depth * INDENT_STEP_REM + INDENT_BASE_REM}rem`,
        };
        // 軸1：選択ドメインを favoriteTree（フォルダ見出し行＋アイテム行）へ拡張した
        // ため、選択判定・data-index とも tree 上の位置（index）をそのまま使う
        // （旧 itemIndex はアイテム行専用の番号で、フォルダ見出し行を選択できなかった）。
        const isSelected = index === selected;

        if (row.kind === "folder") {
          // 削除アイコン（ボタン）を内部に持たせるため、行自体は <button> ではなく
          // <div role="button"> にする（ResultList.tsx の行と同じ理由・同じ
          // パターン。ボタンの入れ子はHTML上不正なため。詳細は CLAUDE.md
          // 「結果行の DOM 構造」節を参照）。
          //
          // アイテム行との視覚的な区別は、フォルダアイコンの塗りつぶし・
          // インデントの深さ・件数バッジの3点のみで表現する（背景帯・太字化・
          // 余白追加は実機確認の結果「なぜここだけ違うのか」という別の違和感を
          // 生んだため撤回した）。行自体の背景・文字の太さ・余白はアイテム行と
          // 同じ扱いのままにする。選択時のハイライト（青背景・白文字）はアイテム行と
          // 同じ配色に揃える（軸1でフォルダ見出し行も選択対象になったため新設）。
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
              onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
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
              {/* 直下（孫は含めない）のノード数を示す件数バッジ。
                  ExtensionFilterEditor.tsx のタグ表示（rounded-full bg-gray-100
                  text-gray-700）と同系統のピル型だが、装飾的な補助情報のため
                  ひとまわり小さく・薄くしている。選択中は MoveButton 等と同じ
                  「白系の半透明」配色にし、青背景での視認性を保つ。 */}
              <span
                className={`ml-2 flex-shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] ${
                  isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {row.directChildCount}
              </span>
              {/* 「上へ移動」「下へ移動」（段階3のドラッグ&ドロップ実装までの
                  暫定手段）。既存の削除アイコンと並べて配置する。 */}
              <MoveButton
                direction="up"
                disabled={row.isFirstSibling}
                selected={isSelected}
                onClick={() => onMoveNode(row.node.id, "up")}
              />
              <MoveButton
                direction="down"
                disabled={row.isLastSibling}
                selected={isSelected}
                onClick={() => onMoveNode(row.node.id, "down")}
              />
              {/* 段階3の本格的なツリー編集UIまでの最小限の削除手段。
                  FileSearchSettings.tsx の検索フォルダ削除ボタンと同じ見た目・
                  配色に揃える。行全体のクリック（折りたたみ切替）に伝播させない
                  よう stopPropagation する。アイコンサイズは★・ピンアイコンと
                  同じ16px（w-4 h-4）に揃える（以前は w-3.5 h-3.5 で他アイコンより
                  明らかに小さく表示されていた）。選択時は MoveButton と同じ考え方で
                  白系配色にする。 */}
              <Tooltip label="このフォルダを削除" className="flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDeleteFolder(row.node.id, row.node.name);
                  }}
                  className={`p-1 rounded ${
                    isSelected
                      ? "text-white/80 hover:bg-white/20"
                      : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                  }`}
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
            </div>
          );
        }

        const item = row.file;
        return (
          <div
            key={row.key}
            role="button"
            data-index={index}
            style={indentStyle}
            className={`w-full flex items-center py-2.5 pr-4 text-left transition-colors ${
              isSelected
                ? "bg-blue-500 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onClick={() => onLaunchFile(item.path)}
            onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
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
                <div className="text-sm font-medium truncate">{item.name}</div>
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
            {/* 「上へ移動」「下へ移動」（段階3のドラッグ&ドロップ実装までの
                暫定手段）。既存の★トグルと並べて配置する。 */}
            <MoveButton
              direction="up"
              disabled={row.isFirstSibling}
              selected={isSelected}
              onClick={() => onMoveNode(row.node.id, "up")}
            />
            <MoveButton
              direction="down"
              disabled={row.isLastSibling}
              selected={isSelected}
              onClick={() => onMoveNode(row.node.id, "down")}
            />
            {/* /favorite モードの一覧内の項目はすべて登録済みのため active は
                常に固定（塗りつぶし表示）。表示条件自体は、通常の検索結果行・
                ピン止めブロックと同じ「selected のときのみ表示」に揃える
                （登録済みかどうかの判定が不要なだけで、選択されていない行では
                アイコン自体を表示しない、という表示条件のパターンは他の一覧と
                共通にする）。押下で即座に解除する
                （REQUIREMENTS.md「/favorite モードでの★アイコン」節を参照）。 */}
            {isSelected && (
              <FavoriteToggleButton
                active
                selected={isSelected}
                onToggle={() => onToggleFavorite(item)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
