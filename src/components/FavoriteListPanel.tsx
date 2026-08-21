import { useRef } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { WarningIcon, FavoriteToggleButton } from "./ToggleIcons";
import { IconSlot } from "./IconSlot";
import {
  FolderChevron,
  FileIcon,
  FOLDER_ICON_PATH,
  INDENT_STEP_REM,
  INDENT_BASE_REM,
} from "./FavoriteTreeVisuals";
import { FavoriteTreeRow, FileEntry } from "../types";
import { browseTreeRowClass } from "../ui/sharedStyles";

// フォルダの折りたたみ・展開を示す▼/▶アイコン、フォルダアイコン、インデント幅は
// FavoriteTreeVisuals.tsx（お気に入り編集ビューと共有）を参照。

// /favorite モードの一覧（フォルダ見出し行＋アイテム行のツリー表示）。00-requirements.md
// 「お気に入り機能」節「/favorite モード」「/favorite モードでの★アイコン」を参照。
//
// 構造の作成・削除・リネーム・並び替えはお気に入り編集ビュー（FavoriteEditView.tsx/
// FavoriteEditTree.tsx）が担う。/favorite モードは「見る・呼び出す・★解除のみ」に
// 限定する（段階2で前倒し実装した「上へ/下へ移動」「フォルダ削除」の暫定UIは、
// 編集ビュー（4a〜4e）が揃った時点で撤去済み。詳細は
// docs/internal-design/favorites-data-model.md#favorite-mode-provisional-features を参照）。
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
}: {
  tree: FavoriteTreeRow[];
  // tree 上の選択インデックス（フォルダ見出し行・アイテム行の両方が対象。軸1で
  // アイテム行専用の番号から拡張した。詳細は FavoriteTreeRow の型コメントを参照）。
  selected: number;
  onSelectRowByKey: (key: string, clientX: number, clientY: number) => void;
  onToggleCollapse: (folderId: string) => void;
  onToggleFavorite: (file: FileEntry) => void;
  onLaunchFile: (path: string) => void;
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
        // （00-requirements.md「フォルダ配下のアイテム行はインデントを1段下げる」。
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
          // 行自体は <button> ではなく <div role="button"> にする（ResultList.tsx の
          // 行と同じ理由・同じパターン。ボタンの入れ子はHTML上不正なため。詳細は
          // CLAUDE.md「結果行の DOM 構造」節を参照）。
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
              className={browseTreeRowClass("folder", { selected: isSelected })}
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
              {/* 行末アイコン群を1つのflexコンテナに包む（現状はこの件数バッジ
                  単独だが、ResultList.tsx・FavoriteEditTree.tsx と同じ
                  IconSlot＋gapの共通ラッパー化規約に揃える。詳細は
                  docs/internal-design/favorites-ui-iconography.md「行内アイコンの
                  共通ラッパー化（IconSlot）」節を参照）。件数バッジ自体は
                  表示専用（クリック不可）のため interactive=false とする。
                  軸4m：以前は桁数に応じて幅が変わるピル型
                  （ExtensionFilterEditor.tsx のタグ表示と同系統）を意図的に
                  維持していたが、実測でお気に入り編集ビューの
                  円形バッジ（circle=24）との不一致が判明したため、こちらも
                  固定サイズの円形（`absolute inset-0` で箱いっぱいの24pxに
                  広げる）に統一した。3桁までは実際の文字サイズで収まる想定
                  （4桁以上は円からはみ出しても許容。実運用でそこまでの件数は
                  稀なため対応不要と判断）。
                  軸4n：背景色だけだと輪郭がぼやけて見えるとの指摘を受け、
                  フッターのキー操作チップ（KeyHint.tsx）と同じ「淡い背景＋薄い
                  ボーダー」方式で境界を明確にする（FavoriteEditTree.tsx の
                  件数バッジと同じ配色ルール）。 */}
              <div className="flex items-center gap-2 ml-2">
                <IconSlot
                  interactive={false}
                  selected={isSelected}
                >
                  <span
                    className={`absolute inset-0 flex items-center justify-center rounded-full border text-[11px] ${
                      isSelected
                        ? "border-white/30 bg-white/20 text-white"
                        : "border-black/10 bg-gray-100 text-gray-500"
                    }`}
                  >
                    {row.directChildCount}
                  </span>
                </IconSlot>
              </div>
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
            className={browseTreeRowClass("item", { selected: isSelected })}
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
                  title={item.path}
                >
                  {item.path}
                </div>
              </div>
            </div>
            {/* 行末アイコン群はまとめて1つのflexコンテナに包み、間隔を
                `gap-2` に一本化する（詳細は
                docs/internal-design/favorites-ui-iconography.md「行内アイコンの
                共通ラッパー化（IconSlot）」節を参照）。 */}
            <div className="flex items-center gap-2 ml-2">
              {!row.exists && <WarningIcon selected={isSelected} />}
              {/* /favorite モードの一覧内の項目はすべて登録済みのため active は
                  常に固定(塗りつぶし表示)。表示条件自体は、通常の検索結果行・
                  ピン止めブロックと同じ「selected のときのみ表示」に揃える
                  （登録済みかどうかの判定が不要なだけで、選択されていない行では
                  アイコン自体を表示しない、という表示条件のパターンは他の一覧と
                  共通にする）。押下で即座に解除する
                  （00-requirements.md「/favorite モードでの★アイコン」節を参照）。 */}
              {isSelected && (
                <FavoriteToggleButton
                  active
                  selected={isSelected}
                  onToggle={() => onToggleFavorite(item)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
