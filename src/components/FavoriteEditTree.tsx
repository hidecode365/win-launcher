import { Fragment, useEffect, useRef, useState } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import {
  computeTreeMoveTarget,
  dropPositionFromRatio,
  isCircularTreeMove,
  resolveTreeDropParent,
  shouldStopEditInputKeyPropagation,
  type TreeDropPosition as DropPosition,
  type TreeDropTarget,
} from "../lib/treeEditUtils";
import { Tooltip } from "./Tooltip";
import { WarningIcon, FavoriteToggleButton } from "./ToggleIcons";
import { IconSlot } from "./IconSlot";
import {
  MANAGE_TREE_ROW_LABEL,
  manageTreeRowClass,
} from "../ui/sharedStyles";
import {
  FolderChevron,
  FileIcon,
  CreateFolderIcon,
  FOLDER_ICON_PATH,
  TRASH_ICON_PATH,
  INDENT_STEP_REM,
  INDENT_BASE_REM,
} from "./FavoriteTreeVisuals";
import {
  CreateFolderResult,
  FAVORITES_FOLDER_ID,
  FavoriteEditTreeRow,
  FileEntry,
} from "../types";

// window レベルの keydown リスナー（App.tsx）が、この編集ビューの間だけ有効な
// ショートカット（F2・Ctrl+Shift+N・Ctrl+Shift+矢印キー4方向）を持つ
// ため、これらのインライン入力欄（RenameInput・CreateFolderInlineRow）は
// 入力中に限りこれらのキーの伝播だけを止める（入力欄自身の通常のテキスト
// 編集を妨げないため）。
// 実装時の注意点：並び替え・再親化のキー割当は軸4jで最終的に
// Ctrl+Shift+↑↓←→へ統一した（当初のAlt+↑↓←→のうち、Alt+←/→はWebView2既定の
// 「戻る/進む」ナビゲーションアクセラレーターとして処理され、preventDefaultでは
// 抑止できず無反応になる不具合があったため軸4hでCtrl+Shift+←/→へ変更し、
// 軸4jで並び替え側のAlt+↑/↓も表記を揃える形でCtrl+Shift+↑/↓へ統一した）。
// Ctrl+Shift+←/→はブラウザ標準のテキスト入力欄で「単語単位の選択」に使われる
// ため、ここで stopPropagation しないと入力欄内でのテキスト選択と window
// リスナーの再親化処理が同時に誤発火する（↑↓はテキスト入力欄で標準の意味を
// 持たないが、入力中に window リスナー側の並び替えが誤発火しないよう同様に
// 止める。矢印キー自体は修飾キーの有無に関わらず常に伝播を止めているため、
// 個別に判定する必要はない）。
// リネーム中の行のインライン入力欄（4d）。CreateFolderInlineRow と同じ
// 「テキストボックス＋Enter確定・Esc取り消し」の見た目・操作感を踏襲する。
// フォーカス時にテキストを全選択する点は RegisterEntryDialog.tsx の表示名欄と同じ。
export function RenameInput({
  initialName,
  className,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  className: string;
  onConfirm: (newName: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const confirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名前を入力してください");
      return;
    }
    // 同名エラー等、Rust側のバリデーションメッセージをそのまま表示し、入力欄は
    // 開いたまま再入力させる（CreateFolderInlineRow・RegisterEntryDialog.tsx の
    // handleCreateFolder と同じ挙動）。
    const err = await onConfirm(trimmed);
    if (err) {
      setError(err);
    }
  };

  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter") {
            // IME変換中のEnterは変換確定だけに使うが、一覧側のEnter処理へは
            // 常に伝播させない。isComposingを伝播停止の条件にも使うと、
            // フォルダ開閉やメモのコピーが誤発火する。
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            confirm();
          } else if (shouldStopEditInputKeyPropagation(e)) {
            // ツリーの選択移動・別の行のリネーム開始・削除・フォルダ作成・
            // 並び替え/再親化（App.tsx の window レベルリスナー）に奪われない
            // よう、入力中はこれらのキーの伝播だけ止める（入力欄内で特に意味を
            // 持たないキーのため preventDefault はしない）。
            e.stopPropagation();
          }
        }}
        data-inline-rename-input="true"
        className={`min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 outline-none focus:border-blue-400 text-gray-800 ${className}`}
        autoComplete="off"
        spellCheck={false}
      />
      {error && (
        <span className="text-[11px] text-red-500 flex-shrink-0">
          {error}
        </span>
      )}
    </div>
  );
}

// フォルダ作成中のインライン入力欄（軸4f：行内アイコン化）。旧・画面下部固定の
// 「+ ここにフォルダを作成」ボタン（CreateFolderRow）を置き換える。作成先
// （targetParentId）・挿入位置（depth）は、作成を開始した時点の選択行（アンカー）
// から呼び出し元（FavoriteEditTree）が算出して渡す。RenameInput と同じ
// 「Rust側のエラーメッセージをそのまま表示する」「Escape取り消し・Enter確定」
// パターンを踏襲する。
export function CreateFolderInlineRow({
  depth,
  targetParentId,
  onCreateFolder,
  onFolderCreated,
  onCancel,
}: {
  depth: number;
  targetParentId: string;
  onCreateFolder: (
    parentId: string,
    name: string
  ) => Promise<CreateFolderResult>;
  onFolderCreated: (folderId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const confirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("フォルダ名を入力してください");
      return;
    }
    const result = await onCreateFolder(targetParentId, trimmed);
    if (result.folder) {
      onFolderCreated(result.folder.id);
    } else {
      setError(result.error ?? "フォルダの作成に失敗しました");
    }
  };

  const indentStyle = {
    paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem`,
  };

  return (
    <div className="flex items-center py-2 pr-2" style={indentStyle}>
      <span className="w-4 mr-1.5 flex-shrink-0" aria-hidden="true" />
      <svg
        className="w-4 h-4 ml-1.5 mr-2 flex-shrink-0 text-gray-400"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d={FOLDER_ICON_PATH} />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            confirm();
          } else if (shouldStopEditInputKeyPropagation(e)) {
            e.stopPropagation();
          }
        }}
        placeholder="新しいフォルダ名"
        className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-sm text-gray-800 outline-none focus:border-blue-400"
        autoComplete="off"
        spellCheck={false}
      />
      {error && (
        <span className="ml-2 text-[11px] text-red-500 flex-shrink-0">
          {error}
        </span>
      )}
    </div>
  );
}

// ドラッグハンドル（⋮⋮）。ResultList.tsx のピン止めブロックと同じ見た目・
// Tooltip文言を踏襲する（00-requirements.md「お気に入り編集ビュー」節「ドラッグハンドル
// は、編集ビュー内の全行に常時表示する（ピン止めブロックのドラッグハンドルと同じ
// 扱い）」を参照）。実際の `draggable` 属性は行全体に付与しており、このハンドルは
// 視覚的な目印（掴める場所を示す）の役割のみを持つ（ピン止めブロックと同じ設計）。
//
// 軸4j：絞り込み中（filtering）はD&Dによる並び替え・再親化自体が無効化される
// ため、「操作できないことが見た目からも分かるように」ハンドルを視覚的に消す。
// ただし `display: none` 等でレイアウトから除去すると、インデント・間隔が
// 詰まって絞り込み解除時にレイアウトが動いてしまうため、`opacity-0` で見た目
// だけを消す（幅・余白は確保したまま）。ツールチップも、見えない要素に対して
// 「ドラッグして並び替え」という誤った操作案内が出ないよう、絞り込み中は
// Tooltip自体を使わないプレーンな span に切り替える。
function DragHandle({
  selected,
  filtering,
}: {
  selected: boolean;
  filtering: boolean;
}) {
  const glyph = (
    <span
      className={`cursor-grab select-none font-bold ${
        filtering ? "opacity-0" : ""
      } ${selected ? "text-white" : "text-gray-400"}`}
    >
      ⋮⋮
    </span>
  );
  if (filtering) {
    return (
      <span
        className="w-4 mr-1.5 flex-shrink-0 flex justify-center"
        aria-hidden="true"
      >
        {glyph}
      </span>
    );
  }
  return (
    <Tooltip
      label="ドラッグして並び替え"
      className="w-4 mr-1.5 flex-shrink-0 justify-center"
    >
      {glyph}
    </Tooltip>
  );
}

// ドロップ位置。"before"/"after" はドロップ先の行と同じ親の下で前後どちらに
// 挿入するか、"into" はドロップ先のフォルダ行の配下（末尾）への再親化を表す。
// フォルダを自分自身、または自分の子孫の中へドロップしようとした場合のエラー文言。
// Rust側 move_favorite_node_to の同一チェックが返すメッセージと文言を揃えている
// （このチェックはドラッグ中の事前判定・onDrop時の即時判定の両方で使うため、
// Rust側を呼ぶまでもなく分かる場合はここで先に弾く。詳細は下記 isValidDropTarget を
// 参照）。
const CIRCULAR_MOVE_ERROR = "フォルダを自分自身の中に移動することはできません";

// ドラッグ中の行が、ドロップ先の行・位置に対して有効な移動先かどうかを判定する
// （4e追加：事前フィードバック）。無効の場合、挿入線・リング枠の視覚フィードバックを
// 出さず、禁止カーソルを表示する。
// - 循環参照（フォルダを自分自身、またはその子孫の中へ移動しようとしている）は
//   Rust側 move_favorite_node_to と同じ祖先走査を、共有の
//   isCircularTreeMoveでドラッグ中に事前判定できる
// - 同名重複はドラッグ中の全ドロップ先を都度計算するとコストが高く、かつ
//   Rust側でしか正確に判定できない（同名判定はトリム・大文字小文字を無視する等の
//   詳細ロジックを持つ）ため、ここでは事前チェックせず、実際のドロップ時に
//   Rust側のエラーをそのまま表示する方式でカバーする
function isValidDropTarget(
  tree: FavoriteEditTreeRow[],
  draggedId: string,
  draggedIsFolder: boolean,
  targetRow: FavoriteEditTreeRow,
  position: DropPosition
): boolean {
  const target = favoriteDropTarget(targetRow);
  if (target.id === draggedId) return false;
  if (!draggedIsFolder) return true;
  const rawNodes = tree.map((r) => r.node);
  const newParentId = resolveTreeDropParent(target, position);
  return !isCircularTreeMove(rawNodes, draggedId, newParentId);
}

function favoriteDropTarget(row: FavoriteEditTreeRow): TreeDropTarget {
  return {
    id: row.node.id,
    parentId: row.node.parentId,
    isFolder: row.kind === "folder",
    directChildCount:
      row.kind === "folder" ? row.directChildCount : undefined,
  };
}

// アイテム行の単一クリックによる起動（02-saved-items.md「お気に入り画面」節）。
// ダブルクリックでのリネームと区別するため、約200〜250ms待ってから起動し、
// その間に2回目のクリックが来た場合（＝ダブルクリック）は起動をキャンセルする。
// Enterによる起動は待たずに直ちに実行する（呼び出し元は本コンポーネントの外、
// App.tsx のキーボードハンドラのまま変更しない）。
const CLICK_LAUNCH_DELAY_MS = 220;

// ヘッダーの「新規フォルダ」アイコン（FavoriteEditView.tsx）用の作成アンカー。
// 行に紐付かない（常にお気に入りルート直下へ作成する）ため、行の key とは別の
// 固定センチネル値で表す（useMemoManage.ts の MEMO_HEADER_CREATE_ANCHOR と同じ考え方）。
export const FAVORITE_HEADER_CREATE_ANCHOR = "__favorite_header__";

// issue 0026 軸B（統合後の /favorite 画面。以前は「お気に入り編集ビュー」専用
// だった）のツリー表示。走査結果（tree）は search.favoriteTree（useSearch.ts）を
// そのまま使う（新規のツリー走査・折りたたみロジックは持たない。CLAUDE.md
// 「同じ走査ロジックを2箇所に持たない」原則を参照）。行の見た目（チェブロン・
// フォルダアイコン・インデント幅・ファイルアイコン・削除アイコン）は
// FavoriteTreeVisuals.tsx を共有する。
//
// 「上へ/下へ移動」ボタンは表示しない（D&Dに統合済み。00-requirements.md
// 「お気に入り画面」節を参照）。削除アイコン・フォルダ作成アイコンは選択中の行に
// のみ表示する。★解除アイコンはアイテム行のみに表示する（フォルダ見出し行には
// 持たせない）。アイテム行は単一クリックまたはEnterでファイルを起動する
// （02-saved-items.md「お気に入り画面」節。ダブルクリックとの判別は
// scheduleLaunch/CLICK_LAUNCH_DELAY_MS を参照）。
//
// リネーム（4d）：F2キー（選択中の行が対象。App.tsx の window レベルリスナー経由）・
// ダブルクリック（クリックした行が対象）のいずれでもインライン編集モードに入る。
//
// フォルダ作成（軸4f、軸B）：Ctrl+Shift+N、行内のフォルダ作成アイコン（選択中の
// 行の直下、アイテム選択時はその親フォルダ直下）、またはヘッダーの新規フォルダ
// アイコン（常にお気に入りルート直下。FAVORITE_HEADER_CREATE_ANCHOR）のいずれかで
// インライン入力欄を表示する。作成を開始した時点のアンカー（行の key、またはヘッダー
// センチネル）を creatingFolderAnchorKey として親（App.tsx）が保持し、この
// コンポーネントはそのキーに一致する行の直後（ヘッダーアンカーの場合は最上部）に
// CreateFolderInlineRow を描画する。
//
// 並び替え・再親化（Ctrl+Shift+↑↓←→、軸4f・軸4jでキー割当を最終確定）：
// App.tsx の window レベルリスナーが move_favorite_node_to を直接呼ぶ
// （このコンポーネントの D&D ロジックとは別経路。実際の移動計算はキー操作
// 専用に App.tsx 側で行う）。
//
// D&D（4e）：HTML5 Drag and Drop API を使う（tauri.conf.json の dragDropEnabled は
// false のまま。既存のピン止めブロック並び替え（ResultList.tsx）と同じ技術選択）。
// 行全体に draggable を付与し、DragHandle（⋮⋮）は掴める場所を示す視覚的な目印
// としてのみ機能する（実装上はどこを掴んでもドラッグできる。ピン止めブロックと
// 同じ設計）。
export function FavoriteEditTree({
  tree,
  selected,
  onSelectRowByHover,
  onRecordMouseMove,
  onToggleCollapse,
  filtering,
  onRequestDeleteFolder,
  onToggleFavorite,
  onMoveNode,
  renamingNodeId,
  onStartRename,
  onCancelRename,
  onConfirmRename,
  onCreateFolder,
  onFolderCreated,
  creatingFolderAnchorKey,
  onStartCreateFolder,
  onCancelCreateFolder,
  onLaunchFile,
}: {
  tree: FavoriteEditTreeRow[];
  // tree 上の選択インデックス。フォルダ見出し行・アイテム行のいずれも対象
  // （useFavoriteEditSelection.ts を参照）。
  selected: number;
  onSelectRowByHover: (key: string, clientX: number, clientY: number) => void;
  onRecordMouseMove: (clientX: number, clientY: number) => void;
  onToggleCollapse: (folderId: string) => void;
  // 軸4g：絞り込み中（filterText 非空）は並び替え・再親化のD&Dを無効化する
  // （00-requirements.md「お気に入り編集ビュー」節を参照）。キー操作側の無効化は
  // App.tsx（moveFavoriteNodeWithinParent/indentFavoriteNode/outdentFavoriteNode）
  // で行っているため、ここではD&Dの起点（draggable）だけを無効化すればよい。
  filtering: boolean;
  onRequestDeleteFolder: (folderId: string, name: string) => void;
  // ★解除（アイテム行のみ）。この一覧内の項目はすべて登録済みのため常に
  // 塗りつぶし表示・即座に解除する（確認なし。/favorite モードでの★アイコンと
  // 同じ挙動。00-requirements.md「/favorite モードでの★アイコン」節を参照）。
  onToggleFavorite: (file: FileEntry) => void;
  // ドラッグ&ドロップによる並び替え・再親化（4e）。エラー時（重複名・循環参照等）は
  // メッセージ文字列を受け取り、ツリー上部に数秒間だけ表示するインライン警告
  // （後述の dragError state）でそのまま表示する（呼び出し元 useSearch.ts の
  // 他の set_* 系コールバックと同じ Promise<string|null> 契約）。
  onMoveNode: (
    id: string,
    newParentId: string,
    targetIndex: number
  ) => Promise<string | null>;
  // 現在インライン編集中のノードID（FavoriteNode.id）。null なら編集中の行なし。
  renamingNodeId: string | null;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (id: string, newName: string) => Promise<string | null>;
  onCreateFolder: (
    parentId: string,
    name: string
  ) => Promise<CreateFolderResult>;
  onFolderCreated: (folderId: string) => void;
  // フォルダ作成中の入力欄をどの行の直後に描画するか（作成を開始した時点の
  // 選択行の key。null なら作成中の入力欄なし）。
  creatingFolderAnchorKey: string | null;
  onStartCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  // 02-saved-items.md「お気に入り画面」節：アイテム行は単一クリックでファイルを
  // 起動する（ダブルクリック＝リネームと約200〜250msで判別する。下記
  // CLICK_LAUNCH_DELAY_MS・pendingClickTimerRef を参照）。
  onLaunchFile: (path: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // シングルクリックでの起動予約タイマー（ダブルクリックで取り消す）。
  const pendingClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (pendingClickTimerRef.current) clearTimeout(pendingClickTimerRef.current);
    };
  }, []);
  const scheduleLaunch = (path: string) => {
    if (pendingClickTimerRef.current) clearTimeout(pendingClickTimerRef.current);
    pendingClickTimerRef.current = setTimeout(() => {
      pendingClickTimerRef.current = null;
      onLaunchFile(path);
    }, CLICK_LAUNCH_DELAY_MS);
  };
  const cancelScheduledLaunch = () => {
    if (pendingClickTimerRef.current) {
      clearTimeout(pendingClickTimerRef.current);
      pendingClickTimerRef.current = null;
    }
  };
  useScrollSelectedIntoView(containerRef, selected);

  // ドラッグ中のノードの id・種別。表示の再計算を必要としないため ref で保持する
  // （ResultList.tsx の dragFromIndexRef と同じ考え方）。種別（フォルダかどうか）は
  // 循環参照の事前判定（isValidDropTarget）に使う。
  const dragInfoRef = useRef<{ id: string; isFolder: boolean } | null>(null);
  // ドロップ位置インジケーターの表示専用 state（ロジックの入力にはしない。
  // 上記コメントを参照）。無効なドロップ先（isValidDropTarget が false を返す
  // 場合）ではセットしない＝インジケーターを出さない。
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    position: DropPosition;
  } | null>(null);
  // ドロップ失敗時のエラーメッセージ（4e追加）。Rust側のバリデーションメッセージ
  // （重複名・循環参照等）をそのまま表示し、数秒後に自動的に消える。
  const [dragError, setDragError] = useState<string | null>(null);
  const dragErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dragErrorTimerRef.current) clearTimeout(dragErrorTimerRef.current);
    };
  }, []);

  const showDragError = (message: string) => {
    if (dragErrorTimerRef.current) clearTimeout(dragErrorTimerRef.current);
    setDragError(message);
    dragErrorTimerRef.current = setTimeout(() => setDragError(null), 4000);
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    row: FavoriteEditTreeRow
  ) => {
    e.preventDefault();
    const dragged = dragInfoRef.current;
    if (dragged === null || dragged.id === row.node.id) {
      e.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position: DropPosition = dropPositionFromRatio(ratio, row.kind === "folder");
    // 循環参照になる移動先は、Rust側の応答を待たずにここで弾く（4e追加：
    // 事前フィードバック）。preventDefault は既に呼んでいるため drop イベント
    // 自体は発火しうるが（dropEffect はカーソル表示のみに影響し、イベント発火を
    // 止めるものではない）、禁止カーソルを表示し挿入線・リング枠は出さない。
    if (!isValidDropTarget(tree, dragged.id, dragged.isFolder, row, position)) {
      e.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ key: row.key, position });
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    row: FavoriteEditTreeRow
  ) => {
    e.preventDefault();
    const dragged = dragInfoRef.current;
    dragInfoRef.current = null;
    setDropTarget(null);
    if (!dragged || dragged.id === row.node.id) return;
    // dropTarget state（表示専用）には頼らず、ドロップ時点の e.clientY から
    // 位置を再計算する（onDragOver の最終更新が反映される前に drop が発火する
    // 競合を避けるため）。
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position: DropPosition = dropPositionFromRatio(ratio, row.kind === "folder");
    // 循環参照は Rust側を呼ぶまでもなく分かるため、ここでも即座に弾く
    // （dragover で禁止カーソルを見た上でなお離した場合の保険）。同名重複は
    // ここでは判定できないため、Rust側の応答（onMoveNode の戻り値）に委ねる。
    if (!isValidDropTarget(tree, dragged.id, dragged.isFolder, row, position)) {
      showDragError(CIRCULAR_MOVE_ERROR);
      return;
    }
    const rawNodes = tree.map((treeRow) => treeRow.node);
    const { newParentId, targetIndex } = computeTreeMoveTarget(
      rawNodes,
      dragged.id,
      favoriteDropTarget(row),
      position
    );
    onMoveNode(dragged.id, newParentId, targetIndex).then((err) => {
      if (err) showDragError(err);
    });
  };

  // フォルダ作成アイコン。選択中の行（フォルダ・アイテムのいずれも）にのみ
  // 表示する（ピン・★アイコンの「選択時のみ表示」と同じ考え方）。サイズ・
  // ホバー表現・stopPropagationは共通ラッパー IconSlot に委譲し、他の行内
  // アイコン（★・件数バッジ・削除アイコン）と同一の「箱」を持つ。この関数は
  // 選択中の行からしか呼ばれないため実質的に selected は常に true だが、
  // 将来の呼び出し元の変化に備えて規約通りの分岐を持たせる。
  // アイコン間の間隔は個別の `ml-2` ではなく、呼び出し元の行が持つ `gap-2` の
  // flexコンテナに委ねる（詳細は docs/internal-design/favorites-ui-iconography.md
  // 「行内アイコンの共通ラッパー化（IconSlot）」節を参照）。
  const renderCreateFolderIcon = (selected: boolean) => (
    <IconSlot
      interactive
      selected={selected}
      tooltip="ここにフォルダを作成"
      onClick={onStartCreateFolder}
    >
      <CreateFolderIcon className="w-4 h-4" />
    </IconSlot>
  );

  const isEmpty = tree.length === 0;
  const isCreatingAtHeader = creatingFolderAnchorKey === FAVORITE_HEADER_CREATE_ANCHOR;

  return (
    <>
      {/* ドロップ失敗時のインライン警告（4e追加）。ツリーの直上に数秒間だけ表示し、
          自動的に消える。Rust側のバリデーションメッセージ（重複名・循環参照等）を
          そのまま表示する（CreateFolderInlineRow・RenameInput と同じ「Rust側の
          エラーメッセージをそのまま表示する」方針）。 */}
      {dragError && (
        <div className="flex-shrink-0 px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-600">
          {dragError}
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onMouseMove={(event) => onRecordMouseMove(event.clientX, event.clientY)}
      >
        {isEmpty && !isCreatingAtHeader && (
          <div className="flex items-center justify-center text-gray-400 text-sm py-6">
            ★ボタンでファイルを登録するか、上部の新規フォルダアイコンでフォルダを作成すると、ここに表示されます
          </div>
        )}
        {/* issue 0026 軸B：ヘッダーの「新規フォルダ」アイコン（FavoriteEditView.tsx）
            から開始した作成は、行に紐付かないためリスト最上部に描画する。 */}
        {isCreatingAtHeader && (
          <CreateFolderInlineRow
            depth={0}
            targetParentId={FAVORITES_FOLDER_ID}
            onCreateFolder={onCreateFolder}
            onFolderCreated={onFolderCreated}
            onCancel={onCancelCreateFolder}
          />
        )}
        {tree.map((row, index) => {
          const isSelected = index === selected;
          const drop = dropTarget?.key === row.key ? dropTarget.position : null;
          const dropClasses = [
            drop === "before" ? "border-t-2 border-blue-500" : "",
            drop === "after" ? "border-b-2 border-blue-500" : "",
            drop === "into" ? "ring-2 ring-inset ring-amber-400" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const isCreatingHere = creatingFolderAnchorKey === row.key;

          const indentStyle = {
            paddingLeft: `${row.depth * INDENT_STEP_REM + INDENT_BASE_REM}rem`,
          };
          const isRenaming = row.node.id === renamingNodeId;

          if (row.kind === "folder") {
            return (
              <Fragment key={row.key}>
                {/* 軸4m：行右端の余白（pr-4）は、アイテム行と統一する。
                    以前はフォルダ行のみ pr-2（8px）で、アイテム行は
                    pr-4（16px）だったため、行末アイコン（削除アイコンが最後に
                    来るフォルダ行 vs ★アイコンが最後に来るアイテム行）で
                    実測のright-gapが8px/16pxとずれて見える原因になっていた
                    （アイコン自身の個別マージンではなく、行のpadding-right
                    自体の不一致が原因。ResultList.tsx も含め、全ての行は
                    pr-4に統一する）。 */}
                <div
                  role="button"
                  data-index={index}
                  draggable={!isRenaming && !filtering}
                  style={indentStyle}
                  className={`${manageTreeRowClass("folder", { selected: isSelected })} ${dropClasses}`}
                  onClick={() => onToggleCollapse(row.node.id)}
                  onDoubleClick={() => onStartRename(row.node.id)}
                  onMouseEnter={(event) =>
                    onSelectRowByHover(row.key, event.clientX, event.clientY)
                  }
                  onDragStart={(e) => {
                    dragInfoRef.current = { id: row.node.id, isFolder: true };
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", row.node.id);
                  }}
                  onDragOver={(e) => handleDragOver(e, row)}
                  onDragLeave={() =>
                    setDropTarget((prev) => (prev?.key === row.key ? null : prev))
                  }
                  onDrop={(e) => handleDrop(e, row)}
                  onDragEnd={() => {
                    dragInfoRef.current = null;
                    setDropTarget(null);
                  }}
                >
                  <DragHandle selected={isSelected} filtering={filtering} />
                  <FolderChevron collapsed={row.collapsed} />
                  <svg
                    className="w-4 h-4 ml-1.5 mr-2 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d={FOLDER_ICON_PATH} />
                  </svg>
                  {isRenaming ? (
                    <RenameInput
                      initialName={row.node.name}
                      className="text-xs"
                      onConfirm={(newName) => onConfirmRename(row.node.id, newName)}
                      onCancel={onCancelRename}
                    />
                  ) : (
                    <span className={MANAGE_TREE_ROW_LABEL.folder}>
                      {row.node.name}
                    </span>
                  )}
                  {/* 行末アイコン群（件数バッジ・フォルダ作成・削除）はまとめて
                      1つのflexコンテナに包み、間隔を個々の `ml-2` ではなく
                      `gap-2` に一本化する。件数バッジは表示専用（クリック不可）
                      のため IconSlot に `interactive={false}` を渡し、ホバー円・
                      Tooltipは持たせないが、他のアイコンと同じ「箱」サイズ
                      （p-1込み）にすることで隣接要素との間隔を統一する（詳細は
                      docs/internal-design/favorites-ui-iconography.md「行内アイコンの
                      共通ラッパー化（IconSlot）」節を参照）。 */}
                  <div className="flex items-center gap-2 ml-2">
                    <IconSlot
                      interactive={false}
                      selected={isSelected}
                    >
                      {/* 軸4m：円のサイズを他のIconSlot系アイコン（★・ピン・
                          削除・フォルダ作成、いずれも実測circle=24）と統一する
                          ため、`w-4 h-4`（16px）ではなく `absolute inset-0` で
                          箱いっぱい（24px）に広げる。フォントサイズも
                          circle=16→24の拡大に合わせて9px→11pxに調整した。
                          軸4n：背景色だけだと輪郭がぼやけて見えるとの指摘を
                          受け、フッターのキー操作チップ（KeyHint.tsx）と同じ
                          「淡い背景＋薄いボーダー」方式で境界を明確にする。
                          選択中の行は青背景の上に白系の縁取り
                          （border-white/30）、非選択行はKeyHintと同じ
                          border-black/10を使う（背景色自体は変更しない）。 */}
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
                    {/* フォルダ作成・削除アイコン。選択中の行にのみ表示する
                        （ピン・★アイコンの「選択時のみ表示」と同じ考え方）。
                        行全体のクリック（折りたたみ切替）に伝播させないよう
                        stopPropagation する（IconSlot に委譲）。 */}
                    {isSelected && !isRenaming && renderCreateFolderIcon(isSelected)}
                    {isSelected && !isRenaming && (
                      <IconSlot
                        interactive
                        selected={isSelected}
                        tooltip="このフォルダを削除"
                        onClick={() =>
                          onRequestDeleteFolder(row.node.id, row.node.name)
                        }
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
                      </IconSlot>
                    )}
                  </div>
                </div>
                {isCreatingHere && (
                  <CreateFolderInlineRow
                    depth={row.depth + 1}
                    targetParentId={row.node.id}
                    onCreateFolder={onCreateFolder}
                    onFolderCreated={onFolderCreated}
                    onCancel={onCancelCreateFolder}
                  />
                )}
              </Fragment>
            );
          }

          const item = row.file;
          return (
            <Fragment key={row.key}>
              <div
                data-index={index}
                draggable={!isRenaming && !filtering}
                style={indentStyle}
                className={`${manageTreeRowClass("item", { selected: isSelected })} ${dropClasses}`}
                onClick={() => {
                  if (isRenaming) return;
                  scheduleLaunch(item.path);
                }}
                onDoubleClick={() => {
                  cancelScheduledLaunch();
                  onStartRename(row.node.id);
                }}
                onMouseEnter={(event) =>
                  onSelectRowByHover(row.key, event.clientX, event.clientY)
                }
                onDragStart={(e) => {
                  dragInfoRef.current = { id: row.node.id, isFolder: false };
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", row.node.id);
                }}
                onDragOver={(e) => handleDragOver(e, row)}
                onDragLeave={() =>
                  setDropTarget((prev) => (prev?.key === row.key ? null : prev))
                }
                onDrop={(e) => handleDrop(e, row)}
                onDragEnd={() => {
                  dragInfoRef.current = null;
                  setDropTarget(null);
                }}
              >
                <DragHandle selected={isSelected} filtering={filtering} />
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
                  {isRenaming ? (
                    <RenameInput
                      initialName={row.node.name}
                      className="text-sm"
                      onConfirm={(newName) => onConfirmRename(row.node.id, newName)}
                      onCancel={onCancelRename}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className={MANAGE_TREE_ROW_LABEL.item}>
                        {item.name}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                        title={item.path}
                      >
                        {item.path}
                      </div>
                    </div>
                  )}
                </div>
                {/* 行末アイコン群はまとめて1つのflexコンテナに包み、間隔を
                    `gap-2` に一本化する（詳細は
                    docs/internal-design/favorites-ui-iconography.md「行内アイコンの
                    共通ラッパー化（IconSlot）」節を参照）。 */}
                <div className="flex items-center gap-2 ml-2">
                  {!row.exists && <WarningIcon selected={isSelected} />}
                  {isSelected && !isRenaming && renderCreateFolderIcon(isSelected)}
                  {isSelected && !isRenaming && (
                    <FavoriteToggleButton
                      active
                      selected={isSelected}
                      onToggle={() => onToggleFavorite(item)}
                    />
                  )}
                </div>
              </div>
              {isCreatingHere && (
                <CreateFolderInlineRow
                  depth={row.depth}
                  targetParentId={row.node.parentId}
                  onCreateFolder={onCreateFolder}
                  onFolderCreated={onFolderCreated}
                  onCancel={onCancelCreateFolder}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
