import { useRef } from "react";
import { formatWithCommas } from "../lib/format";
import { logUiEvent } from "../lib/uiDebugLog";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { Tooltip } from "./Tooltip";
import { SelectableRow } from "./SelectableRow";
import {
  WarningIcon,
  PinIcon,
  FavoriteIcon,
  PinToggleButton,
  FavoriteToggleButton,
} from "./ToggleIcons";
import {
  FileEntry,
  PrefixCommand,
  ResultRow,
  UrlConvertResult,
} from "../types";

const URL_CONVERT_KIND_LABEL: Record<UrlConvertResult["kind"], string> = {
  decode: "デコード結果",
  encode: "エンコード結果",
};
import { WebSearchRow } from "./WebSearchRow";

const PREFIX_COMMAND_ICON_PATH: Record<PrefixCommand["kind"], string> = {
  system: "M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9",
  clipboard:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  recent: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  favorite:
    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
};

// ピン止めブロックのドラッグハンドル用に確保する左端の幅。通常のファイル検索結果行にも
// 同じ幅の空要素を確保し、ピン止めブロックと通常一覧でアイコン・ファイル名の横位置を
// 揃える（ハンドル自体はピン止めブロックの行にのみ描画する。詳細は 00-requirements.md
// 「ピン止め・お気に入り・メモ機能」節の「並び替え操作」を参照）。
const DRAG_HANDLE_GUTTER_CLASS = "w-4 mr-2 flex-shrink-0 text-center";

export function ResultList({
  rows,
  pinIconVisible,
  favoriteIconVisible,
  onTogglePin,
  onToggleFavorite,
  onReorderPinned,
  prefixCommandMode,
  prefixCommandCandidates,
  results,
  query,
  selected,
  baseLength,
  webSearchVisible,
  onSelect,
  onSelectRowByKey,
  onAddSearchFolder,
  onStartShortcutWizard,
  onTogglePinFromPaste,
  onToggleFavoriteFromPaste,
  onCopyResult,
  onSelectPrefixCommand,
  onLaunchFile,
  onOpenWebSearch,
  onCopyUrlConvertResult,
}: {
  // 通常モード（prefixCommandMode を除く）の結果一覧。並び順の正本は
  // useSearch.ts の rows（詳細は CLAUDE.md「結果行のフラット配列化（R-1）」節を
  // 参照）で、App.tsx がそれをそのままこの props として渡す。
  rows: ResultRow[];
  pinIconVisible: boolean;
  favoriteIconVisible: boolean;
  onTogglePin: (file: FileEntry) => void;
  onToggleFavorite: (file: FileEntry) => void;
  onReorderPinned: (fromIndex: number, toIndex: number) => void;
  prefixCommandMode: boolean;
  prefixCommandCandidates: PrefixCommand[];
  // rows.length === 0 かつ query が非空のときの「見つかりませんでした」表示判定に
  // 使う（rows 自体には該当する行が存在しないため、この判定だけは rows と別に
  // results を直接見る必要がある）。
  results: FileEntry[];
  query: string;
  selected: number;
  baseLength: number;
  webSearchVisible: boolean;
  // prefixCommandMode の候補一覧・Web検索行のホバー選択に使う（生インデックス。
  // R-1 フェーズD-2 の対象外のため変更していない）。
  onSelect: (index: number, clientX: number, clientY: number) => void;
  // rows（通常モードの6種類の行）のホバー選択に使う。行の識別子（row.key）を
  // そのまま渡す（R-1 フェーズD-2。詳細は useSearch.ts の SelectIntent 型の
  // コメントを参照）。
  onSelectRowByKey: (key: string, clientX: number, clientY: number) => void;
  onAddSearchFolder: () => void;
  onStartShortcutWizard: () => void;
  onTogglePinFromPaste: () => void;
  onToggleFavoriteFromPaste: () => void;
  onCopyResult: (text: string) => void;
  onSelectPrefixCommand: (cmd: PrefixCommand) => void;
  onLaunchFile: (path: string) => void;
  onOpenWebSearch: (query: string) => void;
  onCopyUrlConvertResult: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);
  const dragFromIndexRef = useRef<number | null>(null);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {prefixCommandMode ? (
        <>
          {prefixCommandCandidates.map((cmd, i) => (
            <SelectableRow
              key={cmd.keyword}
              index={i}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={(e) => {
                // 400_テスト・バグ修正：調査用ログ（詳細は src/lib/uiDebugLog.ts を参照）。
                const target = e.target instanceof HTMLElement ? e.target.tagName : "?";
                void logUiEvent(
                  `[row-click] keyword=${cmd.keyword} x=${e.clientX} y=${e.clientY} target=${target}`
                );
                onSelectPrefixCommand(cmd);
              }}
              onMouseEnter={(e) => onSelect(i, e.clientX, e.clientY)}
            >
              <svg
                className="w-4 h-4 mr-3 flex-shrink-0 opacity-60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={PREFIX_COMMAND_ICON_PATH[cmd.kind]}
                />
              </svg>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{cmd.keyword}</div>
                <div
                  className={`text-xs truncate ${
                    i === selected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {cmd.description}
                </div>
              </div>
            </SelectableRow>
          ))}
          {webSearchVisible && (
            <WebSearchRow
              query={query}
              active={selected === baseLength}
              index={baseLength}
              onClick={() => onOpenWebSearch(query)}
              onMouseEnter={(e) => onSelect(baseLength, e.clientX, e.clientY)}
            />
          )}
        </>
      ) : (
        <>
          {rows.map((row, index) => {
            const isSelected = index === selected;
            switch (row.kind) {
              case "pinned": {
                const item = row.file;
                const exists = row.exists;
                const favorited = row.favorited;
                return (
                  <div
                    key={row.key}
                    role="button"
                    data-index={index}
                    draggable
                    onDragStart={(e) => {
                      dragFromIndexRef.current = index;
                      // dataTransfer への実データ受け渡しは使わず並び替え先の判定は
                      // dragFromIndexRef（クロージャ経由）で行うが、effectAllowed を
                      // 明示しないと一部環境でドロップ不可（禁止カーソル）と誤判定
                      // されることがあるため、setData と合わせて明示しておく。
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragOver={(e) => {
                      // ドロップを許可するには dragover の既定動作を必ず抑止する
                      // （抑止しないとブラウザは「ドロップ不可」として扱い、禁止
                      // カーソルのまま drop イベントが発火しない）。dropEffect も
                      // effectAllowed と一致させ、カーソルを "move" 相当にする。
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragFromIndexRef.current;
                      dragFromIndexRef.current = null;
                      if (from !== null) onReorderPinned(from, index);
                    }}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => onLaunchFile(item.path)}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    {/* 行の左端に位置するため、既定（左側表示）だと画面外へ
                        はみ出す。side="right" で右側表示に切り替える
                        （詳細は CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。 */}
                    <Tooltip
                      label="ドラッグして並び替え"
                      side="right"
                      className="w-4 mr-2 flex-shrink-0 justify-center"
                    >
                      <span
                        className={`cursor-grab select-none font-bold ${
                          isSelected ? "text-white" : "text-gray-500"
                        }`}
                      >
                        ⋮⋮
                      </span>
                    </Tooltip>
                    {/* 実体が存在しない場合の「グレーアウト」は、ファイルアイコン・
                        ファイル名・パス部分にのみ適用する。警告アイコン・ピンアイコンは
                        むしろ確実に気づいてもらう必要がある要素のため、opacity を
                        下げる対象から明示的に除外する（以前はボタン全体に opacity-50
                        をかけていたため、警告アイコンの視認性向上（塗りつぶし化・
                        彩度アップ）の効果が薄れてしまっていた）。 */}
                    <div
                      className={`flex items-center min-w-0 flex-1 ${
                        !exists ? "opacity-50" : ""
                      }`}
                    >
                      {item.icon ? (
                        <img
                          src={item.icon}
                          alt=""
                          className="w-4 h-4 mr-3 flex-shrink-0"
                        />
                      ) : (
                        <svg
                          className="w-4 h-4 mr-3 flex-shrink-0 opacity-60"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <div
                          className={`text-xs truncate ${
                            isSelected ? "text-blue-100" : "text-gray-400"
                          }`}
                          title={item.path}
                        >
                          {item.path}
                        </div>
                      </div>
                    </div>
                    {/* 行末アイコン群はまとめて1つのflexコンテナに包み、アイコン間の
                        間隔を個々の `ml-2` ではなくこの `gap-2` に一本化する
                        （詳細は docs/internal-design/favorites-ui-iconography.md
                        「行内アイコンの共通ラッパー化（IconSlot）」節を参照）。 */}
                    <div className="flex items-center gap-2 ml-2">
                      {!exists && <WarningIcon selected={isSelected} />}
                      {/* ピン止めブロックは全行が既にピン止め済みのため、非選択時に
                          常時表示すると状態を区別する情報を持たない単なる装飾になる
                          （ブロックであること自体はドラッグハンドルが示す）。選択中
                          （ピン止め解除操作が可能）のときのみ表示する。実体が無い行
                          でも、選択中であれば手動解除できるようこの条件のみで判断する。 */}
                      {isSelected && (
                        <PinToggleButton
                          active
                          selected={isSelected}
                          onToggle={() => onTogglePin(item)}
                        />
                      )}
                      {/* お気に入りはピン止めと異なりブロック内の全行が登録済みとは
                          限らないため（独立した機能）、通常のファイル検索結果行と
                          同じ表示条件（登録済み、または選択中）で判断する。
                          favoriteIconVisible（favoriteEnabled）が false の場合は
                          ピンアイコンの pinIconVisible と同様、表示自体を行わない。 */}
                      {favoriteIconVisible && (favorited || isSelected) && (
                        <FavoriteToggleButton
                          active={favorited}
                          selected={isSelected}
                          onToggle={() => onToggleFavorite(item)}
                        />
                      )}
                    </div>
                  </div>
                );
              }
              case "pathPasteShortcut": {
                const candidate = row.candidate;
                return (
                  <div
                    key={row.key}
                    role="button"
                    data-index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={onStartShortcutWizard}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    <svg
                      className={`w-4 h-4 mr-3 flex-shrink-0 ${
                        isSelected ? "text-white" : "text-blue-500"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5m5.656-5.656l1.5-1.5a4 4 0 115.656 5.656l-4 4a4 4 0 01-5.656 0"
                      />
                    </svg>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        検索フォルダにショートカット配置: {candidate.name}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        Enter で名前・配置先を選択
                      </div>
                    </div>
                  </div>
                );
              }
              case "pathPasteAddFolder": {
                const candidate = row.candidate;
                return (
                  <div
                    key={row.key}
                    role="button"
                    data-index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={onAddSearchFolder}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    <svg
                      className={`w-4 h-4 mr-3 flex-shrink-0 ${
                        isSelected ? "text-white" : "text-blue-500"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m3-3H9m11 5V7a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2z"
                      />
                    </svg>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        検索フォルダに追加: {candidate.name}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        Enter で追加
                      </div>
                    </div>
                  </div>
                );
              }
              case "pathPastePin": {
                const { candidate, pinned } = row;
                return (
                  <SelectableRow
                    key={row.key}
                    index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={onTogglePinFromPaste}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    <span className={`w-4 h-4 mr-3 flex-shrink-0 ${isSelected ? "text-white" : "text-blue-500"}`}>
                      <PinIcon filled={pinned} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{pinned ? "ピン止めから削除" : "ピン止めする"}: {candidate.name}</div>
                      <div className={`text-xs truncate ${isSelected ? "text-blue-100" : "text-gray-400"}`}>Enter で{pinned ? "解除" : "ピン止め"}</div>
                    </div>
                  </SelectableRow>
                );
              }
              case "pathPasteFavorite": {
                const { candidate, favorited } = row;
                return (
                  <SelectableRow
                    key={row.key}
                    index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={onToggleFavoriteFromPaste}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    <span className={`w-4 h-4 mr-3 flex-shrink-0 ${isSelected ? "text-white" : "text-blue-500"}`}>
                      <FavoriteIcon filled={favorited} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{favorited ? "お気に入りから削除" : "お気に入りに追加"}: {candidate.name}</div>
                      <div className={`text-xs truncate ${isSelected ? "text-blue-100" : "text-gray-400"}`}>Enter で{favorited ? "解除" : "登録"}</div>
                    </div>
                  </SelectableRow>
                );
              }
              case "calc": {
                const result = row.result;
                return (
                  <div
                    key={row.key}
                    role="button"
                    data-index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => onCopyResult(result)}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {formatWithCommas(result)}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        Enter でコピー
                      </div>
                    </div>
                  </div>
                );
              }
              case "urlConvert": {
                const result = row.result;
                return (
                  <div
                    key={row.key}
                    role="button"
                    data-index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => onCopyUrlConvertResult(result.text)}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    <svg
                      className={`w-4 h-4 mr-3 flex-shrink-0 ${
                        isSelected ? "text-white" : "text-blue-500"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5m5.656-5.656l1.5-1.5a4 4 0 115.656 5.656l-4 4a4 4 0 01-5.656 0"
                      />
                    </svg>
                    <div className="min-w-0">
                      <div
                        className={`text-[11px] truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        {URL_CONVERT_KIND_LABEL[result.kind]}
                      </div>
                      <div className="text-sm font-medium truncate">
                        {result.text}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        Enter でコピー
                      </div>
                    </div>
                  </div>
                );
              }
              case "file": {
                const item = row.file;
                const pinned = pinIconVisible && row.pinned;
                const favorited = row.favorited;
                return (
                  <div
                    key={row.key}
                    role="button"
                    data-index={index}
                    className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => onLaunchFile(item.path)}
                    onMouseEnter={(e) => onSelectRowByKey(row.key, e.clientX, e.clientY)}
                  >
                    {/* ピン止めブロックのドラッグハンドルと横位置を揃えるための空スペーサー
                        （このモードでは描画しない）。 */}
                    {pinIconVisible && <span className={DRAG_HANDLE_GUTTER_CLASS} />}
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt=""
                        className="w-4 h-4 mr-3 flex-shrink-0"
                      />
                    ) : (
                      <svg
                        className="w-4 h-4 mr-3 flex-shrink-0 opacity-60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                        title={item.path}
                      >
                        {item.path}
                      </div>
                    </div>
                    {/* 行末アイコン群はまとめて1つのflexコンテナに包み、アイコン間の
                        間隔を個々の `ml-2` ではなくこの `gap-2` に一本化する
                        （詳細は docs/internal-design/favorites-ui-iconography.md
                        「行内アイコンの共通ラッパー化（IconSlot）」節を参照）。 */}
                    <div className="flex items-center gap-2 ml-2">
                      {/* 未ピン止め・非選択の組み合わせではアイコン自体を表示しない
                          （行が選択されて初めて「ピン止めする」候補として現れる）。 */}
                      {pinIconVisible && (pinned || isSelected) && (
                        <PinToggleButton
                          active={pinned}
                          selected={isSelected}
                          onToggle={() => onTogglePin(item)}
                        />
                      )}
                      {/* 未登録・非選択の組み合わせではアイコン自体を表示しない
                          （ピンアイコンと同じ表示条件）。favoriteIconVisible
                          （favoriteEnabled）が false の場合は pinIconVisible と
                          同様、表示自体を行わない。 */}
                      {favoriteIconVisible && (favorited || isSelected) && (
                        <FavoriteToggleButton
                          active={favorited}
                          selected={isSelected}
                          onToggle={() => onToggleFavorite(item)}
                        />
                      )}
                    </div>
                  </div>
                );
              }
            }
          })}
          {results.length === 0 && query.length > 0 && (
            <div className="flex items-center justify-center text-gray-400 text-sm py-6">
              見つかりませんでした
            </div>
          )}
          {webSearchVisible && (
            <WebSearchRow
              query={query}
              active={selected === baseLength}
              index={baseLength}
              onClick={() => onOpenWebSearch(query)}
              onMouseEnter={(e) => onSelect(baseLength, e.clientX, e.clientY)}
            />
          )}
        </>
      )}
    </div>
  );
}
