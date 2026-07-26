import { useRef } from "react";
import { formatWithCommas } from "../lib/format";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { Tooltip } from "./Tooltip";
import { FileEntry, PastedPathInfo, PrefixCommand, UrlConvertResult } from "../types";

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
};

// ピン（画鋲）アイコンのシルエット。単色・グラデーションなし・装飾なしのフラット
// なSVG素材（ICOOON MONO「押しピンのアイコン素材」。
// D:\ai_work\dev_win\assets\win-launcher\icon\02_ピン止めアイコン\
// 押しピンのアイコン素材.svg）のジオメトリ（viewBox 0 0 512 512、頭部用 path・
// 針用 polygon の2パーツ）をそのまま流用する。
//
// 描画は fill="currentColor" の単色塗りのみで行い、輪郭線（stroke）は持たない
// （元データが `fill:#4B4B4B` の単色フラットシルエットとして設計されているため。
// 輪郭線＋本体の二色構成を後付けすると素材本来の設計から外れる、という判断の
// 経緯は CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。ピン止め済みか
// どうかは色（濃淡）で表現し、形状・fill/strokeの切り替えでは表現しない
// （詳細は PinToggleButton を参照）。
const PIN_HEAD_PATH =
  "M335.719,0l-49.953,49.953l26.453,26.438c0,0-20.563,20.578-55.844,55.828c-61.688,61.703-133.813,48.891-165.859,16.828l-45.406,45.406l272.438,272.453l45.406-45.422c-32.047-32.047-44.859-104.172,16.828-165.859c35.25-35.266,55.828-55.828,55.828-55.828l26.438,26.438L512,176.297L335.719,0z";
const PIN_NEEDLE_POINTS =
  "138.594,325.328 3.719,460.234 0,512 51.781,508.297 186.672,373.422 162.625,349.375";

// 実体が存在しないピン止め項目に付与する警告アイコン（塗りつぶし三角形＋「!」）。
// 外側の三角形と「!」（縦棒＋点の2つの小さな矩形）を1つの path にまとめ、
// fillRule="evenodd" で「!」部分を三角形の塗りに対する穴として抜く。穴の部分は
// 常に行の背景色がそのまま透けて見えるため、行の背景（白／青ハイライト／
// グレーアウト）がどれであっても「!」の視認性が背景色に左右されない
// （視認性改善の詳細は CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
const WARNING_ICON_PATH =
  "M12 2L23 21H1Z M11 8H13V14H11Z M11 16H13V18H11Z";

// ピン止めブロックのドラッグハンドル用に確保する左端の幅。通常のファイル検索結果行にも
// 同じ幅の空要素を確保し、ピン止めブロックと通常一覧でアイコン・ファイル名の横位置を
// 揃える（ハンドル自体はピン止めブロックの行にのみ描画する。詳細は REQUIREMENTS.md
// 「ピン止め・お気に入り・メモ機能」節の「並び替え操作」を参照）。
const DRAG_HANDLE_GUTTER_CLASS = "w-4 mr-2 flex-shrink-0 text-center";

// 警告アイコン（塗りつぶし三角形）の縁取りに使う、背景色に関わらず視認できる
// 半透明の暗色。SVG の既定の描画順（fill → stroke）ではストロークがパスの境界線上に
// 重なって描かれるため、塗り本体の色を変えずに輪郭だけくっきりさせられる（詳細は
// CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
const FILLED_ICON_OUTLINE_COLOR = "rgba(0,0,0,0.35)";

// ピン（画鋲）アイコン本体。fill="currentColor" の単色塗りのみで描画し、色や
// 濃淡は呼び出し元（PinToggleButton）が className で制御する。サイズは
// 20px（w-5）から18pxへ引き下げている（単色シルエットは、以前の輪郭線＋本体の
// 二色構成より視覚的な重さが増すため。Tailwind既定のサイズ刻みに18pxが無いため
// 任意値クラス `w-[18px] h-[18px]` を使う）。
function PinIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 512 512" fill="currentColor">
      <path d={PIN_HEAD_PATH} />
      <polygon points={PIN_NEEDLE_POINTS} />
    </svg>
  );
}

// 実体が存在しないピン止め項目に付与する警告アイコン（塗りつぶし三角形＋「!」）。
// 「!」部分は fillRule="evenodd" による穴抜きのため常に背景色が透けて見える
// （WARNING_ICON_PATH のコメントを参照）。三角形の輪郭にも PinIcon と同じ半透明の
// 縁取りを添え、背景色によらず形状の境界が視認できるようにする。
//
// ツールチップ（「実体が見つかりません」）は SVG の <title> 要素ではなく共通
// コンポーネント Tooltip を使う（SVG <title> も HTML の title 属性と同じ表示遅延・
// 表示位置の問題を持つブラウザ既定の仕組みのため。詳細は Tooltip.tsx・CLAUDE.md
// 「ピン止め・お気に入り・メモ機能」節を参照）。レイアウトに関わるクラス
// （mr-1 flex-shrink-0）は Tooltip のラッパー側に持たせる。
function WarningIcon({ selected }: { selected: boolean }) {
  return (
    <Tooltip label="実体が見つかりません" className="mr-1 flex-shrink-0">
      <svg
        className={selected ? "w-5 h-5 text-amber-200" : "w-5 h-5 text-amber-600"}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke={FILLED_ICON_OUTLINE_COLOR}
        strokeWidth={0.5}
      >
        <path fillRule="evenodd" clipRule="evenodd" d={WARNING_ICON_PATH} />
      </svg>
    </Tooltip>
  );
}

// ピン止め済みかどうかを色の濃淡で表現する（色相ではなく濃淡で状態を表現する。
// 検索結果行におけるピンアイコンの役割はあくまで「操作部品」であり、色を持つのは
// コンテンツ（ファイルアイコン）だけという原則に揃えるため、高彩度の固定パレットは
// 使わず、行の文字色に追従するニュートラルな階調のみを使う）。
// - 非選択・ピン止め済み → gray-600（白背景に対して十分な濃さのニュートラルグレー）
// - 選択中・未ピン止め   → 白・opacity 0.55（「押せば付く」を薄い白で示す）
// - 選択中・ピン止め済み → 白・opacity 1.0（「押せば外れる」を濃い白で示す）
// 非選択・未ピン止めの組み合わせは呼び出し側がそもそもこのコンポーネントを
// 描画しない（PinToggleButton 自体は「表示するときにどう塗るか」だけを持つ）。
// 詳細・判断根拠は CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照。
function pinIconColorClass(active: boolean, selected: boolean): string {
  if (selected) {
    return active ? "text-white" : "text-white opacity-[0.55]";
  }
  return "text-gray-600";
}

// ピンのクリックによる ON/OFF トグルボタン。行全体の onClick（起動）に伝播させない
// よう stopPropagation する。
//
// 行の状態は「非選択」「選択中」の2つのみで扱う。本アプリはマウスホバーで選択行
// そのものが移動する（onMouseEnter が onSelect を呼ぶ）ため、「ホバー中」と
// 「選択中」は同一の状態であり、ホバー専用のスタイル分岐は持たない（過去に
// 選択中の行へ opacity-60 のホバー用スタイルが誤って波及した不具合があったため、
// この2状態モデルに統一して構造的に再発しないようにしている）。
//
// アイコン単体へのマウスホバーには、行の選択とは独立した反応として、背景に淡い
// 円形のハイライトを表示する（クリック可能であることを示すための、アイコン専用の
// ホバー効果。行の選択状態そのものは変えない）。白背景の行では黒6%、青背景の行
// （selected）では白20%の半透明を使う。
//
// ツールチップ（「ピン止めする」/「ピン止めを解除」）は title 属性ではなく
// 共通コンポーネント Tooltip を使う（title は表示遅延・表示位置を制御できない
// ため。詳細は Tooltip.tsx・CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
// レイアウトに関わるクラス（ml-2 flex-shrink-0）は Tooltip のラッパー側に持たせ、
// button 自身は見た目（丸み・パディング・色）のみを持つ。
function PinToggleButton({
  active,
  onToggle,
  selected,
}: {
  active: boolean;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <Tooltip
      label={active ? "ピン止めを解除" : "ピン止めする"}
      className="ml-2 flex-shrink-0"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`rounded-full p-1 transition-colors ${
          selected ? "hover:bg-white/20" : "hover:bg-black/[6%]"
        } ${pinIconColorClass(active, selected)}`}
      >
        <PinIcon />
      </button>
    </Tooltip>
  );
}

export function ResultList({
  pinnedVisible,
  pinnedFiles,
  pinnedExistence,
  pinIconVisible,
  isPinned,
  onTogglePin,
  onReorderPinned,
  pathPasteCandidate,
  calcResult,
  prefixCommandMode,
  prefixCommandCandidates,
  results,
  urlConvertResult,
  query,
  selected,
  baseLength,
  webSearchVisible,
  onSelect,
  onAddSearchFolder,
  onStartShortcutWizard,
  onCopyResult,
  onSelectPrefixCommand,
  onLaunchFile,
  onOpenWebSearch,
  onCopyUrlConvertResult,
}: {
  pinnedVisible: boolean;
  pinnedFiles: FileEntry[];
  pinnedExistence: Record<string, boolean>;
  pinIconVisible: boolean;
  isPinned: (path: string) => boolean;
  onTogglePin: (file: FileEntry) => void;
  onReorderPinned: (fromIndex: number, toIndex: number) => void;
  pathPasteCandidate: PastedPathInfo | null;
  calcResult: string | null;
  prefixCommandMode: boolean;
  prefixCommandCandidates: PrefixCommand[];
  results: FileEntry[];
  urlConvertResult: UrlConvertResult | null;
  query: string;
  selected: number;
  baseLength: number;
  webSearchVisible: boolean;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  onAddSearchFolder: () => void;
  onStartShortcutWizard: () => void;
  onCopyResult: (text: string) => void;
  onSelectPrefixCommand: (cmd: PrefixCommand) => void;
  onLaunchFile: (path: string) => void;
  onOpenWebSearch: (query: string) => void;
  onCopyUrlConvertResult: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);
  const dragFromIndexRef = useRef<number | null>(null);

  // ピン止めブロックは常にインデックス0から占有する（表示中なら）。パス貼り付け
  // 候補・計算結果・URLエンコード/デコード結果・ファイル検索結果は、既存の優先順序
  // （REQUIREMENTS.md「基本動作」節）はそのままに、ピン止めブロックの件数分だけ
  // 後ろへオフセットされる。
  const pinnedOffset = pinnedVisible ? pinnedFiles.length : 0;
  // パス貼り付けの候補行（ショートカット配置→(フォルダのみ)検索フォルダに追加）は
  // 常に先頭を占有する。ローカルパスは数式計算・URLエンコード/デコードの判定条件と
  // 構造上両立しないため、この2つと同時に発生することはない（詳細は
  // REQUIREMENTS.md「パス貼り付けによる検索フォルダ管理」節を参照）。
  const pathPasteOffset =
    pinnedOffset + (pathPasteCandidate ? (pathPasteCandidate.isDir ? 2 : 1) : 0);
  const calcIndex = pathPasteOffset;
  const calcOffset = pathPasteOffset + (calcResult !== null ? 1 : 0);
  const urlConvertOffset = calcOffset + (urlConvertResult !== null ? 1 : 0);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {prefixCommandMode ? (
        <>
          {prefixCommandCandidates.map((cmd, i) => (
            <button
              key={cmd.keyword}
              data-index={i}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onSelectPrefixCommand(cmd)}
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
            </button>
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
          {pinnedVisible &&
            pinnedFiles.map((item, i) => {
              const exists = pinnedExistence[item.path] ?? true;
              const isSelected = i === selected;
              return (
                <button
                  key={item.path}
                  data-index={i}
                  draggable
                  onDragStart={(e) => {
                    dragFromIndexRef.current = i;
                    // dataTransfer への実データ受け渡しは使わず並び替え先の判定は
                    // dragFromIndexRef（クロージャ経由）で行うが、effectAllowed を
                    // 明示しないと一部環境でドロップ不可（禁止カーソル）と誤判定
                    // されることがあるため、setData と合わせて明示しておく。
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
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
                    if (from !== null) onReorderPinned(from, i);
                  }}
                  className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                    isSelected
                      ? "bg-blue-500 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => onLaunchFile(item.path)}
                  onMouseEnter={(e) => onSelect(i, e.clientX, e.clientY)}
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
                      >
                        {item.path}
                      </div>
                    </div>
                  </div>
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
                </button>
              );
            })}
          {pathPasteCandidate !== null && (
            <>
              <button
                data-index={pinnedOffset}
                className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                  selected === pinnedOffset
                    ? "bg-blue-500 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                onClick={onStartShortcutWizard}
                onMouseEnter={(e) => onSelect(pinnedOffset, e.clientX, e.clientY)}
              >
                <svg
                  className={`w-4 h-4 mr-3 flex-shrink-0 ${
                    selected === pinnedOffset ? "text-white" : "text-blue-500"
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
                    検索フォルダにショートカット配置: {pathPasteCandidate.name}
                  </div>
                  <div
                    className={`text-xs truncate ${
                      selected === pinnedOffset ? "text-blue-100" : "text-gray-400"
                    }`}
                  >
                    Enter で名前・配置先を選択
                  </div>
                </div>
              </button>
              {pathPasteCandidate.isDir && (
                <button
                  data-index={pinnedOffset + 1}
                  className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                    selected === pinnedOffset + 1
                      ? "bg-blue-500 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={onAddSearchFolder}
                  onMouseEnter={(e) =>
                    onSelect(pinnedOffset + 1, e.clientX, e.clientY)
                  }
                >
                  <svg
                    className={`w-4 h-4 mr-3 flex-shrink-0 ${
                      selected === pinnedOffset + 1 ? "text-white" : "text-blue-500"
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
                      検索フォルダに追加: {pathPasteCandidate.name}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        selected === pinnedOffset + 1
                          ? "text-blue-100"
                          : "text-gray-400"
                      }`}
                    >
                      Enter で追加
                    </div>
                  </div>
                </button>
              )}
            </>
          )}
          {calcResult !== null && (
            <button
              data-index={calcIndex}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                selected === calcIndex
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onCopyResult(calcResult)}
              onMouseEnter={(e) => onSelect(calcIndex, e.clientX, e.clientY)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {formatWithCommas(calcResult)}
                </div>
                <div
                  className={`text-xs truncate ${
                    selected === calcIndex ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  Enter でコピー
                </div>
              </div>
            </button>
          )}
          {urlConvertResult !== null && (
            <button
              data-index={calcOffset}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                selected === calcOffset
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onCopyUrlConvertResult(urlConvertResult.text)}
              onMouseEnter={(e) => onSelect(calcOffset, e.clientX, e.clientY)}
            >
              <svg
                className={`w-4 h-4 mr-3 flex-shrink-0 ${
                  selected === calcOffset ? "text-white" : "text-blue-500"
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
                    selected === calcOffset ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {URL_CONVERT_KIND_LABEL[urlConvertResult.kind]}
                </div>
                <div className="text-sm font-medium truncate">
                  {urlConvertResult.text}
                </div>
                <div
                  className={`text-xs truncate ${
                    selected === calcOffset ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  Enter でコピー
                </div>
              </div>
            </button>
          )}
          {results.length === 0 && query.length > 0 && (
            <div className="flex items-center justify-center text-gray-400 text-sm py-6">
              見つかりませんでした
            </div>
          )}
          {results.map((item, i) => {
            const index = i + urlConvertOffset;
            const isSelected = index === selected;
            const pinned = pinIconVisible && isPinned(item.path);
            return (
            <button
              key={item.path}
              data-index={index}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                isSelected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onLaunchFile(item.path)}
              onMouseEnter={(e) => onSelect(index, e.clientX, e.clientY)}
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
                >
                  {item.path}
                </div>
              </div>
              {/* 未ピン止め・非選択の組み合わせではアイコン自体を表示しない
                  （行が選択されて初めて「ピン止めする」候補として現れる）。 */}
              {pinIconVisible && (pinned || isSelected) && (
                <PinToggleButton
                  active={pinned}
                  selected={isSelected}
                  onToggle={() => onTogglePin(item)}
                />
              )}
            </button>
            );
          })}
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
