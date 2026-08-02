import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { logUiEvent } from "./lib/uiDebugLog";
import { useSettings } from "./hooks/useSettings";
import { useHotkey } from "./hooks/useHotkey";
import { useSearch } from "./hooks/useSearch";
import { useFavoriteEditSelection } from "./hooks/useFavoriteEditSelection";
import { useClipboard } from "./hooks/useClipboard";
import { useOcr } from "./hooks/useOcr";
import { useUpdater } from "./hooks/useUpdater";
import { SearchBox } from "./components/SearchBox";
import { OcrPreview } from "./components/OcrPreview";
import { ResultList } from "./components/ResultList";
import { PathPasteWizard } from "./components/PathPasteWizard";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SystemCommandModal } from "./components/SystemCommandModal";
import { RegisterEntryDialog } from "./components/RegisterEntryDialog";
import { FavoriteListPanel } from "./components/FavoriteListPanel";
import { FavoriteFolderDeleteModal } from "./components/FavoriteFolderDeleteModal";
import { FavoriteEditView } from "./components/FavoriteEditView";
import { UpdateDialog } from "./components/UpdateDialog";
import { IconSlotMeasureOverlay } from "./components/IconSlotMeasureOverlay";
import { StatusFooter } from "./components/StatusFooter";
import { hideWindow } from "./lib/window";
import { FAVORITES_FOLDER_ID, favoriteFolderRowKey } from "./types";
import type {
  ClipboardTextEntry,
  FavoriteEditTreeRow,
  FileEntry,
  FrecencyMap,
} from "./types";

// 仮想行「Top」（kind: "top"）を除いた、実体（FavoriteNode）を持つ行かどうかの
// 判定。Array.prototype.filter に渡すコールバックが単なる真偽値を返すだけだと
// TypeScript は要素型を絞り込めない（"top" を含む型のまま残る）ため、型述語
// （type predicate）としてここに1箇所だけ定義し、Ctrl+Shift+矢印による
// 並び替え・再親化（moveFavoriteNodeWithinParent/indentFavoriteNode/
// outdentFavoriteNode）が共通で使う。
function hasFavoriteNode(
  row: FavoriteEditTreeRow
): row is Exclude<FavoriteEditTreeRow, { kind: "top" }> {
  return row.kind !== "top";
}

const DEFAULT_CLIPBOARD_PANE_WIDTH = 224;

// 「検索」「設定」「お気に入り編集」の3枚の全画面ビュー（軸4a）。二択の boolean
// swap（旧 showSettings）では3枚目のビューを表現できないため enum 化した。
// いずれも同一の main ウィンドウ内での表示切り替えであり、新規のOSウィンドウは
// 作らない（REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
type MainView = "search" | "settings" | "favoriteEdit";

export default function App() {
  const [view, setView] = useState<MainView>("search");
  // 既存コードとの互換のため、設定パネル表示中かどうかは派生値として残す
  // （useSettings への引数・多数の分岐で使われている）。
  const showSettings = view === "settings";
  const favoriteEditOpen = view === "favoriteEdit";
  const [settingsVersion, setSettingsVersion] = useState(0);
  // 軸4k：全画面のフッター右端に統一表示するアプリのバージョン番号。以前は
  // SettingsPanel.tsx が自身のフッター専用に個別取得していたが、フッターが
  // 検索画面・クリップボード履歴モード・パス貼り付けウィザード・お気に入り
  // 編集ビュー・設定画面のすべてに展開されたため、ここで一度だけ取得して
  // 各フッターへ props として配る。
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    getVersion().then((v) => setAppVersion(v));
  }, []);
  const [ocrClosing, setOcrClosing] = useState(false);
  // 400_テスト・バグ修正：IconSlot実測サイズのデバッグオーバーレイ（一時的な
  // 開発者向け機能）。Ctrl+Alt+Mでトグルする。詳細は
  // IconSlotMeasureOverlay.tsx のコメントを参照。
  const [iconMeasureOverlayOpen, setIconMeasureOverlayOpen] = useState(false);
  const [clipboardPaneWidth, setClipboardPaneWidth] = useState(
    DEFAULT_CLIPBOARD_PANE_WIDTH
  );
  const clipboardPaneWidthRef = useRef(DEFAULT_CLIPBOARD_PANE_WIDTH);
  const storeRef = useRef<Store | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // フォーカスアウト時自動非表示の判定用（後述のフォーカス監視 useEffect は依存配列が
  // 空で一度しかマウントされないため、view state を直接参照すると初回値の古い
  // クロージャのままになる。毎レンダーで最新値を書き込むこの ref を代わりに参照する）。
  // 検索UI自体が表示されていないビュー（設定・お気に入り編集のいずれも）では
  // 自動非表示を適用しない（元は showSettings 専用の例外だったが、3枚目の
  // ビュー追加に伴い「検索ビュー以外では適用しない」という条件へ一般化した）。
  const viewRef = useRef(view);
  viewRef.current = view;

  const settings = useSettings(showSettings);
  const hotkey = useHotkey(settings.setAppSettings);
  const search = useSearch(settings.appSettings, settingsVersion, storeRef);
  // お気に入り編集ビュー専用の選択状態（/favorite ブラウジング側の選択とは独立した
  // ドメイン。REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。データソースは
  // search.favoriteTree をそのまま共有する。
  const favoriteEdit = useFavoriteEditSelection(
    search.favoriteEditRawTree,
    search.favoriteEditFilterText
  );
  const ocr = useOcr();
  const updater = useUpdater();
  const clipboard = useClipboard(
    settings.appSettingsRef,
    search.clipboardMode,
    search.clipboardFilterText,
    storeRef,
    search.closeWindow,
    search.syncClipboardSelectionItems
  );

  useEffect(() => {
    // view を依存配列にすることで、設定パネルだけでなくお気に入り編集ビューを
    // 閉じて検索ビューへ戻った場合にも再フォーカスされる（showSettings のみを
    // 見ていた頃は favoriteEdit → search の遷移で showSettings 自体が変化しない
    // ため再フォーカスが効かなかった）。
    //
    // 400_テスト・バグ修正：view のみを条件にしていたため、検索ビュー内で
    // SearchBox の上に開閉するモーダル・ダイアログ（登録ダイアログ・
    // システムコマンド確認・フォルダ削除確認・パス貼り付けウィザード）を
    // 閉じても view 自体は "search" のまま変化せずこの effect が発火せず、
    // SearchBox へ再フォーカスされない不具合があった。これらのstateはいずれも
    // 「検索ビュー内で SearchBox を隠す/disabledにするオーバーレイ」という
    // 共通の性質を持つため、個別に列挙せず `search.searchOverlayActive`
    // （useSearch.ts 側で一括判定した1つの派生値）を参照する。新しい同種の
    // モーダルを追加する場合も、ここではなく useSearch.ts の
    // searchOverlayActive の配列へ1state追加するだけでよい（この effect・
    // SearchBox の disabled 判定・handleKeyDown の早期return の3箇所が自動的に
    // 追従する。詳細は docs/internal-design/window-lifecycle.md
    // 「検索ビュー上のオーバーレイstate一覧の単一化（searchOverlayActive）」節を参照）。
    if (view === "search" && !search.searchOverlayActive) {
      inputRef.current?.focus();
    }
  }, [view, search.searchOverlayActive]);

  const handleOcrClose = useCallback(() => {
    ocr.clearOcr();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [ocr.clearOcr]);

  // Ctrl+D（クエリ全クリア）の分岐判定に使う。OCR プレビュー表示中かどうかで挙動が
  // 変わるため、キー操作のエフェクトより前に算出しておく（JSX 側での利用は後述）。
  const ocrActive =
    ocr.ocrLoading || ocr.ocrText !== null || ocr.ocrError !== null;

  // 起動時アップデートチェック。設定の初回読み込みが完了した時点で一度だけ行う
  // （appSettings は他の設定変更でも更新されるため、settingsLoaded 遷移時のみに限定する）。
  // 失敗時もコンソールログのみに留め、起動シーケンスは妨げない（useUpdater.runCheck の
  // silent オプションが「見つからない／失敗」時のダイアログ表示を抑制する）。
  const didStartupUpdateCheckRef = useRef(false);
  useEffect(() => {
    if (!settings.settingsLoaded || didStartupUpdateCheckRef.current) return;
    didStartupUpdateCheckRef.current = true;
    if (settings.appSettings.checkUpdateOnStartup) {
      updater.runCheck({ silent: true }).catch(console.error);
    }
  }, [settings.settingsLoaded, settings.appSettings.checkUpdateOnStartup, updater.runCheck]);

  const handleOcrCopyAndClose = useCallback(async () => {
    if (ocr.ocrText !== null) {
      await invoke("copy_to_clipboard", { text: ocr.ocrText }).catch(
        console.error
      );
    }
    setOcrClosing(true);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await hideWindow();
    setOcrClosing(false);
    ocr.clearOcr();
  }, [ocr.ocrText, ocr.clearOcr]);

  // ファイル起動履歴（frecency）とクリップボードのテキスト履歴を読み込む。
  // Rust 側にコマンドを追加せず、settings.json を Rust と共有する
  // @tauri-apps/plugin-store の JS API から直接アクセスする。
  useEffect(() => {
    Store.load("settings.json")
      .then((store) => {
        storeRef.current = store;
        return Promise.all([
          store.get<FrecencyMap>("frecency"),
          store.get<FrecencyMap>("prefixCommandFrecency"),
          store.get<ClipboardTextEntry[]>("clipboardHistory"),
          store.get<number>("clipboardPaneWidth"),
        ]);
      })
      .then(([frecencyData, prefixCommandFrecencyData, clipboardData, paneWidthData]) => {
        search.setInitialFrecency(frecencyData ?? {});
        search.setInitialPrefixCommandFrecency(prefixCommandFrecencyData ?? {});
        clipboard.setInitialHistory(clipboardData ?? []);
        const paneWidth = paneWidthData ?? DEFAULT_CLIPBOARD_PANE_WIDTH;
        clipboardPaneWidthRef.current = paneWidth;
        setClipboardPaneWidth(paneWidth);
      })
      .catch(console.error);
  }, []);

  // ウィンドウサイズの永続化。位置とは異なりサイズのみ保存する。
  // リサイズ確定から 500ms デバウンスしたうえで settings.json へ論理ピクセルで
  // 書き込む。適用（読み込み・反映）は Rust 側の起動時処理が担う。
  //
  // 検索/設定ビューは従来通り "windowSize" キーを共有するが、お気に入り編集
  // ビューは軸4a（骨格）の時点から独立した "favoriteEditWindowSize" キーへ保存する
  // （REQUIREMENTS.md「お気に入り編集ビュー」節：「設定パネルとは独立した永続化
  // キーを持たせる」。段階5でメモ本文編集を同じビューに追加する際、検索/設定側の
  // サイズと巻き添えで混ざらないようにするための布石）。ビューを開いた時点で
  // このキーの値を読み出してウィンドウへ適用する処理は、編集ビューの中身を実装する
  // 4b以降の対象とする（骨格の時点では保存のみを行う）。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    getCurrentWindow()
      .onResized(({ payload: size }) => {
        if (resizeTimer !== undefined) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(async () => {
          const store = storeRef.current;
          if (!store) return;
          const win = getCurrentWindow();
          const scaleFactor = await win.scaleFactor().catch(() => 1);
          const logical = size.toLogical(scaleFactor);
          const key =
            viewRef.current === "favoriteEdit"
              ? "favoriteEditWindowSize"
              : "windowSize";
          await store.set(key, {
            width: Math.round(logical.width),
            height: Math.round(logical.height),
          });
          await store.save();
        }, 500);
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      if (resizeTimer !== undefined) clearTimeout(resizeTimer);
      unlisten?.();
    };
  }, []);

  const handlePaneWidthChange = useCallback(async (width: number) => {
    clipboardPaneWidthRef.current = width;
    setClipboardPaneWidth(width);
    const store = storeRef.current;
    if (!store) return;
    await store.set("clipboardPaneWidth", width);
    await store.save();
  }, []);

  const openSettings = useCallback(() => {
    setView("settings");
  }, []);

  // 設定パネル内の各タブのバリデーションエラー（ホットキー・システムコマンドの
  // キーワード・クリップボード・最近使ったファイル・フォルダ詳細設定）は、それぞれの
  // タブ／モーダルコンポーネントのローカル state として保持している。SettingsPanel は
  // パネルを閉じるとまるごと unmount されるため、ここで個別にリセットする必要はない
  // （タブ切り替え時に各タブが unmount される際も同じ理由で自動的に破棄される。詳細は
  // CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const closeSettings = useCallback(() => {
    setView("search");
    setSettingsVersion((v) => v + 1);
  }, []);

  // 4d：編集ビューでのリネーム対象（FavoriteNode.id）。null なら編集中の行なし。
  // F2キー（App.tsx の window レベルリスナー。選択中の行が対象）・ダブルクリック
  // （FavoriteEditTree.tsx。クリックした行が対象）のいずれからも開始できる。
  // リネームはノードの識別子を変更しないため、選択状態（favoriteEdit）は
  // このstateとは独立して特別な復元処理なしでそのまま維持される
  // （REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。closeFavoriteEdit より
  // 前で宣言する（closeFavoriteEdit がこの state のリセットも兼ねるため）。
  const [renamingFavoriteNodeId, setRenamingFavoriteNodeId] = useState<
    string | null
  >(null);
  const cancelRenameFavoriteNode = useCallback(() => {
    setRenamingFavoriteNodeId(null);
  }, []);
  const confirmRenameFavoriteNode = useCallback(
    async (id: string, newName: string): Promise<string | null> => {
      const error = await search.renameFavoriteNode(id, newName);
      if (!error) {
        setRenamingFavoriteNodeId(null);
      }
      return error;
    },
    [search.renameFavoriteNode]
  );

  // お気に入り編集ビューの開閉。設定パネルとは異なりバリデーションエラー等の
  // 状態を持たないため、view の切り替えのみでよい。/favorite ブラウジング側の
  // 絞り込み文字列・選択位置・フォルダ展開状態は useSearch 側の state であり、
  // このビューを開いてもアンマウントされないため自動的に保持される
  // （FavoriteEditView.tsx のコメントを参照）。
  const openFavoriteEdit = useCallback(() => {
    setView("favoriteEdit");
  }, []);
  // 軸4f：編集ビューでのフォルダ作成中の入力欄の描画位置（アンカー行の key）。
  // null なら作成中の入力欄なし。作成を開始した時点の選択行を凍結して保持する
  // （マウスホバーによる選択移動が入力中の対象をずらさないようにするため。
  // renamingFavoriteNodeId と同じ「App.tsx 側にリフトした state」パターンを踏襲する）。
  const [creatingFolderAnchorKey, setCreatingFolderAnchorKey] = useState<
    string | null
  >(null);
  const startCreateFolder = useCallback(() => {
    const row = favoriteEdit.tree[favoriteEdit.selected];
    if (row) {
      setCreatingFolderAnchorKey(row.key);
    }
  }, [favoriteEdit.tree, favoriteEdit.selected]);
  const cancelCreateFolder = useCallback(() => {
    setCreatingFolderAnchorKey(null);
  }, []);

  const closeFavoriteEdit = useCallback(() => {
    setView("search");
    // リネーム中・フォルダ作成中に「戻る」ボタン等で編集ビューを閉じた場合、
    // renamingFavoriteNodeId・creatingFolderAnchorKey は view とは独立した state
    // のため放置すると残り続け、次回このビューを開いた瞬間に同じ行が編集モードの
    // まま表示されてしまう（App.tsx はアンマウントされないため）。閉じる際に
    // 必ずリセットする。
    setRenamingFavoriteNodeId(null);
    setCreatingFolderAnchorKey(null);
    // 軸4h：絞り込み文字列（favoriteEditFilterText）も同じ理由でリセットする。
    // /favorite ブラウジング側の favoriteFilterText はREQUIREMENTS.mdの明記通り
    // 閉じても保持する仕様だが、編集ビュー専用のこの絞り込みは保持する仕様として
    // 明記されていなかった（実装時の独自判断だった）。残したままにすると、
    // 絞り込み文字列が入力された状態で編集ビューを閉じ、後で（別の目的で）再度
    // 開いた際に、本人が意識しないまま絞り込みが有効なままになり、絞り込み中は
    // 無効化される並び替え・再親化のドラッグ&ドロップが「原因不明に動かない」
    // ように見える不具合の温床になっていた（実機テストで報告された「D&Dによる
    // 再親化が動作しない」の実際の原因の一つ）。編集ビューを開き直すたびに
    // 空の状態から始める方が事故が少ないと判断し、閉じる際に必ず空文字へ戻す。
    search.setFavoriteEditFilterText("");
  }, [search.setFavoriteEditFilterText]);

  // 4c：編集ビューでのフォルダ作成完了後、新規フォルダへ選択状態を移し、作成中の
  // 入力欄を閉じる（識別子ベースの intent。useFavoriteEditSelection の既存の
  // 仕組みに乗せる。REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
  const handleFavoriteEditFolderCreated = useCallback(
    (folderId: string) => {
      favoriteEdit.selectByKey(favoriteFolderRowKey(folderId));
      setCreatingFolderAnchorKey(null);
    },
    [favoriteEdit.selectByKey]
  );

  // 4c：編集ビューでのフォルダ削除要求。search.requestDeleteFavoriteFolder は
  // /favorite ブラウジングの暫定UIとも共有する関数のため、削除確定後にどちらの
  // 選択ドメインをリセットするかを明示的に渡す（編集ビューは favoriteEdit.resetToTop、
  // ブラウジング側は既定値のまま）。
  const requestDeleteFavoriteEditFolder = useCallback(
    (folderId: string, name: string) => {
      search.requestDeleteFavoriteFolder(
        folderId,
        name,
        favoriteEdit.resetToTop
      );
    },
    [search.requestDeleteFavoriteFolder, favoriteEdit.resetToTop]
  );

  // 編集ビューでの★解除。解除の挙動自体（確認なしの即時解除）はブラウジング側と
  // 同じ search.toggleFavorite をそのまま呼ぶが、解除確定後の選択復元は
  // 編集ビュー自身の選択ドメイン（favoriteEdit）に対して行う必要があるため、
  // requestDeleteFavoriteEditFolder と同じ「呼び出し元が復元コールバックを渡す」
  // 設計に従う。単一アイテムの解除のため、favoriteTree 上で隣接する行（無ければ
  // 前の行）へ選択を引き継ぎ、対象が見つからない場合のみ resetToTop へ
  // フォールバックする（REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
  const toggleFavoriteFromEditView = useCallback(
    (file: FileEntry) => {
      const tree = search.favoriteTree;
      const removedIndex = tree.findIndex(
        (row) => row.kind === "item" && row.file.path === file.path
      );
      const neighbor =
        (removedIndex !== -1 ? tree[removedIndex + 1] : undefined) ??
        (removedIndex !== -1 ? tree[removedIndex - 1] : undefined) ??
        null;
      search.toggleFavorite(
        file,
        neighbor
          ? () => favoriteEdit.selectByKey(neighbor.key)
          : favoriteEdit.resetToTop
      );
    },
    [
      search.favoriteTree,
      search.toggleFavorite,
      favoriteEdit.selectByKey,
      favoriteEdit.resetToTop,
    ]
  );

  // 軸4f：Ctrl+Shift+↑/↓（軸4jでAlt+↑/↓から変更）による同一親内での並び替え。
  // 既存の move_favorite_node_to
  // （ドラッグ&ドロップと同じRustコマンド）にそのまま乗せる。target_index は
  // 「移動対象自身を除いた兄弟配列（order昇順）上の挿入位置」という契約
  // （main.rs のコメントを参照）のため、直前/直後の兄弟と入れ替えたい場合、
  // その兄弟の（自身除去後の配列上での）位置がそのまま挿入位置になる
  // （上へ移動＝その兄弟の位置にそのまま挿入／下へ移動＝その兄弟の位置の1つ後ろに
  // 挿入）。Topは並び替えの対象にならない。
  const moveFavoriteNodeWithinParent = useCallback(
    (direction: 1 | -1) => {
      // 軸4g：絞り込み中は並び替えを無効化する（REQUIREMENTS.md「お気に入り編集
      // ビュー」節を参照）。
      if (search.favoriteEditFilterText.length > 0) return;
      const row = favoriteEdit.tree[favoriteEdit.selected];
      if (!row || row.kind === "top") return;
      const parentId = row.node.parentId;
      const siblings = favoriteEdit.tree
        .filter(hasFavoriteNode)
        .filter((r) => r.node.parentId === parentId);
      const pos = siblings.findIndex((r) => r.node.id === row.node.id);
      const swapPos = pos + direction;
      if (pos === -1 || swapPos < 0 || swapPos >= siblings.length) return;
      const swapSibling = siblings[swapPos];
      const others = siblings.filter((_, i) => i !== pos);
      const swapIndexInOthers = others.findIndex(
        (r) => r.node.id === swapSibling.node.id
      );
      const targetIndex =
        direction === -1 ? swapIndexInOthers : swapIndexInOthers + 1;
      search.moveFavoriteNodeTo(row.node.id, parentId, targetIndex).then((err) => {
        if (err) console.error(err);
      });
    },
    [favoriteEdit.tree, favoriteEdit.selected, search.moveFavoriteNodeTo, search.favoriteEditFilterText]
  );

  // 軸4f：Ctrl+Shift+→（軸4hでAlt+→から変更）による再親化（インデント）。
  // 選択中の行を、同一親内の直前の兄弟（フォルダである場合のみ）の配下・末尾へ
  // 移動する。直前の兄弟が無い、またはフォルダでない場合は無効（何もしない）。
  // Topは対象にならない。
  const indentFavoriteNode = useCallback(() => {
    // 軸4g：絞り込み中は再親化を無効化する。
    if (search.favoriteEditFilterText.length > 0) return;
    const row = favoriteEdit.tree[favoriteEdit.selected];
    if (!row || row.kind === "top") return;
    const parentId = row.node.parentId;
    const siblings = favoriteEdit.tree
      .filter(hasFavoriteNode)
      .filter((r) => r.node.parentId === parentId);
    const pos = siblings.findIndex((r) => r.node.id === row.node.id);
    if (pos <= 0) return;
    const prevSibling = siblings[pos - 1];
    if (prevSibling.kind !== "folder") return;
    const newParentChildren = favoriteEdit.tree
      .filter(hasFavoriteNode)
      .filter((r) => r.node.parentId === prevSibling.node.id);
    search
      .moveFavoriteNodeTo(row.node.id, prevSibling.node.id, newParentChildren.length)
      .then((err) => {
        if (err) console.error(err);
      });
  }, [
    favoriteEdit.tree,
    favoriteEdit.selected,
    search.moveFavoriteNodeTo,
    search.favoriteEditFilterText,
  ]);

  // 軸4f：Ctrl+Shift+←（軸4hでAlt+←から変更）による再親化（アウトデント）。
  // 選択中の行を、現在の親のさらに親（祖父母フォルダ）の直下へ、元の親のすぐ
  // 後ろの位置に移動する。現在の親が既にルート（FAVORITES_FOLDER_ID）の場合は
  // これ以上outdentできないため無効。Topは対象にならない。
  const outdentFavoriteNode = useCallback(() => {
    // 軸4g：絞り込み中は再親化を無効化する。
    if (search.favoriteEditFilterText.length > 0) return;
    const row = favoriteEdit.tree[favoriteEdit.selected];
    if (!row || row.kind === "top") return;
    const parentId = row.node.parentId;
    if (parentId === FAVORITES_FOLDER_ID) return;
    const parentRow = favoriteEdit.tree.find(
      (r) => r.kind === "folder" && r.node.id === parentId
    );
    if (!parentRow || parentRow.kind !== "folder") return;
    const grandparentId = parentRow.node.parentId;
    const grandparentChildren = favoriteEdit.tree
      .filter(hasFavoriteNode)
      .filter(
        (r) => r.node.parentId === grandparentId && r.node.id !== row.node.id
      );
    const parentPos = grandparentChildren.findIndex(
      (r) => r.node.id === parentId
    );
    const targetIndex =
      parentPos === -1 ? grandparentChildren.length : parentPos + 1;
    search.moveFavoriteNodeTo(row.node.id, grandparentId, targetIndex).then((err) => {
      if (err) console.error(err);
    });
  }, [
    favoriteEdit.tree,
    favoriteEdit.selected,
    search.moveFavoriteNodeTo,
    search.favoriteEditFilterText,
  ]);

  // 設定パネルの開閉・クエリ全クリア（Ctrl+D）・パス貼り付けウィザードのフォルダ選択
  // ステップの操作は document レベルの keydown で処理する。input 要素のローカル
  // onKeyDown に持たせると、フォーカス状態や WebView2 のブラウザ既定動作（Ctrl+S の
  // ページ保存、Ctrl+D のブックマーク追加）の影響で発火しないことがあるため、この
  // 一箇所に統一している。
  // Ctrl+D は OCR プレビュー表示中のみ「閉じる」ボタン（handleOcrClose）と同一の処理を
  // 呼び、それ以外の全モードでは現在のモードに関わらずクエリを問答無用で空文字にする
  // （ウィンドウは閉じないため closeWindow は経由しない。closeRefreshTick の加算も
  // 不要：query 自体が変化するので検索用 useEffect は通常通り再トリガーされる）。
  // 検索 UI そのものが表示されていない設定パネル表示中・お気に入り編集ビュー
  // 表示中（showSettings／favoriteEditOpen）は対象外とする。
  //
  // パス貼り付けウィザードの両ステップ（"folderSelect"／"nameEdit"）も、SearchBox の
  // フォーカス状態に依存しないここで一括処理する。
  // - "folderSelect"：候補行は SearchBox とは別の `<button>` 要素（一覧の各行）であり、
  //   Enter 確定直後や行のクリックでフォーカスが SearchBox から外れうる（フォーカス先の
  //   行がステップ遷移で DOM から消えると、フォーカスは document.body に戻り、SearchBox
  //   の React onKeyDown（handleKeyDown）には keydown が届かなくなる）。
  // - "nameEdit"：専用の入力欄（PathPasteWizard 内、マウント時に focus() 済み）は
  //   常にフォーカスされているため上記の問題は起きないが、そちらにローカルの
  //   onKeyDown を残すとこの window リスナーとの二重発火（Escape が1ステップではなく
  //   2ステップ分戻ってしまう等）が起こりうるため、ここに一本化する
  //   （PathPasteWizard の入力欄からは Enter/Escape の onKeyDown を削除済み）。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 400_テスト・バグ修正：IconSlot実測サイズのデバッグオーバーレイ
      // （一時的な開発者向け機能）。他のどのモードよりも優先して最初に判定し、
      // 該当する場合は以降の分岐を一切実行しない（return）。
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setIconMeasureOverlayOpen((v) => !v);
        return;
      }
      if (iconMeasureOverlayOpen && e.key === "Escape") {
        e.preventDefault();
        setIconMeasureOverlayOpen(false);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        // 軸4k：Ctrl+Sは「検索画面表示中に押されたときのみ設定画面を開く」
        // 非対称な動作に変更した（以前はトグルで開閉していた）。設定画面を
        // 閉じる手段はEscのみに一本化する（REQUIREMENTS.md「キー操作」節を
        // 参照）。設定画面表示中にCtrl+Sを押しても何も起きないが、preventDefault
        // 自体は常に行う（WebView2既定の「ページを保存」ダイアログを、設定画面
        // 表示中も含めて常に抑止するため）。
        e.preventDefault();
        e.stopPropagation();
        if (
          !showSettings &&
          !favoriteEditOpen &&
          !search.pendingCommand &&
          !search.favoriteDialogTarget &&
          !search.pendingDeleteFavoriteFolder
        ) {
          openSettings();
        }
      } else if (e.key === "Escape" && showSettings) {
        closeSettings();
      } else if (favoriteEditOpen && search.pendingDeleteFavoriteFolder) {
        // 削除確認モーダル表示中は Escape のみキャンセル扱いにする（下の
        // favoriteEditOpen 単体の分岐より先に判定し、Escape でモーダルではなく
        // ビュー自体が閉じてしまわないようにする。/favorite ブラウジング側の
        // pendingDeleteFavoriteFolder 分岐と同じ理由）。
        if (e.key === "Escape") {
          e.preventDefault();
          search.cancelDeleteFavoriteFolder();
        }
      } else if (favoriteEditOpen) {
        // お気に入り編集ビューのキー操作。パス貼り付けウィザードと同様、キー操作は
        // window レベルのリスナーに一本化し、個別コンポーネントのローカル
        // onKeyDown とは併存させない（CLAUDE.md「複数ステップのウィザード形式
        // インタラクション」節の考え方をここにも適用する）。ただし「ここに
        // フォルダを作成」・リネームのインライン入力欄はテキスト入力欄自体の性質上、
        // RegisterEntryDialog.tsx と同じローカル onKeyDown ＋ stopPropagation の
        // パターンを使う（入力欄にフォーカスがある間はこの window リスナーまで
        // 伝播しない。詳細は FavoriteEditTree.tsx の shouldStopEditInputKeyPropagation
        // を参照）。
        //
        // 軸4f：Ctrl+Shift+N（フォルダ作成）は他のケースと異なり修飾キーの組み合わせ
        // で判定するため、switch (e.key) に先立って個別に判定する（"N"/"n" いずれの
        // 大文字小文字でも Shift の状態に関わらず一致させるため toLowerCase で比較）。
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
          e.preventDefault();
          startCreateFolder();
          return;
        }
        switch (e.key) {
          case "Escape":
            // 設定パネルと同様、Esc で検索ビューへ戻る（ヘッダーの「戻る」
            // ボタンと同じ操作）。
            closeFavoriteEdit();
            break;
          case "ArrowDown":
            e.preventDefault();
            // 軸4j：並び替え（同一親内での入れ替え）のキー割当を Alt+↑/↓ から
            // Ctrl+Shift+↑/↓ へ変更した（再親化のCtrl+Shift+←/→と対にして
            // 「並び替え・再親化はCtrl+Shift+矢印キー」に統一するため）。
            // 単独では通常の選択移動。
            if (e.ctrlKey && e.shiftKey) {
              moveFavoriteNodeWithinParent(1);
            } else {
              favoriteEdit.moveSelection(1);
            }
            break;
          case "ArrowUp":
            e.preventDefault();
            if (e.ctrlKey && e.shiftKey) {
              moveFavoriteNodeWithinParent(-1);
            } else {
              favoriteEdit.moveSelection(-1);
            }
            break;
          case "ArrowLeft":
            // 軸4h：再親化（アウトデント）のキー割当を Alt+← から
            // Ctrl+Shift+← へ変更した。Alt+←/→ はWebView2既定の「戻る/進む」
            // ナビゲーションアクセラレーターとして処理され、JavaScript側の
            // keydownイベントとは別経路で消費されるためpreventDefaultでは
            // 抑止できず無反応になる不具合があった（詳細はDESIGN_LOG・
            // docs/internal-design/window-and-hotkey.md を参照）。Altなしの単独の←は、
            // 検索ボックスのテキストカーソル移動と競合するため割り当てない
            // （/favorite モードの「←→キーには階層操作を割り当てない」方針と
            // 同じ）。
            if (e.ctrlKey && e.shiftKey) {
              e.preventDefault();
              outdentFavoriteNode();
            }
            break;
          case "ArrowRight":
            if (e.ctrlKey && e.shiftKey) {
              e.preventDefault();
              indentFavoriteNode();
            }
            break;
          case "Enter": {
            // フォルダ見出し行では開閉をトグルする（onToggleCollapse を直接
            // 呼び出し、▼クリックのイベント発火を疑似的に模倣しない）。アイテム行・
            // Top行では何もしない（このビューはファイルを起動する画面ではなく、構造を
            // 閲覧・整理する画面のため。REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
            const row = favoriteEdit.tree[favoriteEdit.selected];
            if (row?.kind === "folder") {
              search.toggleFavoriteFolderCollapsedInEdit(row.node.id);
            }
            break;
          }
          case "F2": {
            // 選択中の行をインライン編集モードにする（4d：リネーム）。この
            // window リスナー自体が favoriteEditOpen の間だけ生きているため、
            // 「編集ビューにフォーカスがある間のみ有効」という制約は自動的に
            // 満たされる（グローバルショートカットにはしない。REQUIREMENTS.md
            // 「お気に入り編集ビュー」節を参照）。Top行は実体を持たないため
            // リネーム対象外（row.kind === "top" のときは node を持たないため
            // 何もしない）。
            e.preventDefault();
            const row = favoriteEdit.tree[favoriteEdit.selected];
            if (row && row.kind !== "top") {
              setRenamingFavoriteNodeId(row.node.id);
            }
            break;
          }
          case "Delete": {
            // 軸4f：フォルダ選択時は削除確認、アイテム選択時は★解除（確認なし、
            // ★アイコンクリックと同じ挙動）。Top選択時は何もしない。
            e.preventDefault();
            const row = favoriteEdit.tree[favoriteEdit.selected];
            if (row?.kind === "folder") {
              requestDeleteFavoriteEditFolder(row.node.id, row.node.name);
            } else if (row?.kind === "item") {
              toggleFavoriteFromEditView(row.file);
            }
            break;
          }
        }
      } else if (
        !showSettings &&
        !favoriteEditOpen &&
        e.ctrlKey &&
        e.key.toLowerCase() === "d"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (ocrActive) {
          handleOcrClose();
        } else {
          search.setQuery("");
        }
      } else if (!showSettings && !favoriteEditOpen && search.pathPasteWizardMode) {
        if (search.wizardStep === "folderSelect") {
          switch (e.key) {
            case "Escape":
              e.preventDefault();
              search.wizardBack();
              break;
            case "ArrowDown":
              e.preventDefault();
              search.setSelected((s) =>
                Math.min(s + 1, search.wizardFolders.length - 1)
              );
              break;
            case "ArrowUp":
              e.preventDefault();
              search.setSelected((s) => Math.max(s - 1, 0));
              break;
            case "Enter": {
              e.preventDefault();
              const folder = search.wizardFolders[search.selected];
              if (folder) search.selectWizardFolder(folder);
              break;
            }
          }
        } else if (search.wizardStep === "nameEdit") {
          if (e.key === "Escape") {
            e.preventDefault();
            search.wizardBack();
          } else if (e.key === "Enter") {
            e.preventDefault();
            search.confirmShortcut();
          }
        }
      } else if (
        !showSettings &&
        !favoriteEditOpen &&
        search.pendingDeleteFavoriteFolder
      ) {
        // 削除確認モーダルはマウス操作（キャンセル/削除ボタン）のみを主とするが、
        // Escape だけは他のモーダル（システムコマンド確認等）と同様にキャンセル
        // 扱いにする。モーダルを開いたトリガー（ゴミ箱アイコンボタン）がクリック後
        // フォーカスを持つため、SearchBox の React onKeyDown ではなくこの window
        // レベルのリスナーで処理する（パス貼り付けウィザードと同じ理由）。
        if (e.key === "Escape") {
          e.preventDefault();
          search.cancelDeleteFavoriteFolder();
        }
      } else if (
        !showSettings &&
        !favoriteEditOpen &&
        search.favoriteDialogTarget
      ) {
        // 400_テスト・バグ修正：登録ダイアログ（RegisterEntryDialog）を開いた
        // トリガー（★ボタン）はクリック後それ自身にフォーカスを持つため、
        // ダイアログ自身のマウント時 autoFocus（requestAnimationFrame越しに
        // 表示名欄へ focus() する）が何らかの理由で間に合わない場合、
        // フォーカスがダイアログ内のどの要素にも当たらないまま Escape を押しても
        // ダイアログ自身の onKeyDown（React合成イベント）まで到達せず閉じられない
        // 不具合があった。パス貼り付けウィザード・フォルダ削除確認モーダルと
        // 同じ理由で、Escapeによるキャンセルだけはこの window レベルのリスナーにも
        // 用意し、フォーカス位置によらず確実に閉じられるようにする（フォーカスが
        // ダイアログ内の要素にある通常時は、ダイアログ自身の onKeyDown が先に
        // 処理してstopPropagationするため、ここには到達せず二重処理にはならない）。
        // Enterによる保存は表示名・保存先フォルダ等ダイアログ内部のstateを
        // 必要とするため、引き続きダイアログ自身のonKeyDownのみで処理する。
        if (e.key === "Escape") {
          e.preventDefault();
          search.closeFavoriteDialog();
        }
      } else if (
        !showSettings &&
        !favoriteEditOpen &&
        search.pendingCommand
      ) {
        // docs/external-design/01-screen-transitions.md「モーダル・ダイアログの
        // キー操作原則」：キャンセル（Escape）のみフォーカス位置に依存させず
        // window レベルで常に処理する。確定（Enter）は独自分岐を設けず、
        // ブラウザ標準のフォーカス経路（Tabで移動した「実行」ボタン上のEnterで
        // click発火）に委ねる（deleteFolder=FavoriteFolderDeleteModalと同じ
        // 参照実装。旧・独自Enter分岐は、キーのチャタリング／WebView2の入力
        // 二重発火により確認を経ず即実行される事故を招いたため撤去した。
        // 詳細は同ドキュメント「systemCommandの是正方針」を参照）。
        //
        // モーダルを開いたトリガー要素がクリック後もフォーカスを持ち続ける
        // ことがあるため、Escapeはフォーカス依存のローカル onKeyDown では
        // 拾えない場合がある。フォルダ削除確認モーダル・登録ダイアログと
        // 同じ理由で、この window レベルのリスナーで確実に処理する
        // （SearchBox側のhandleKeyDownはpendingCommand中は何もしないため、
        // 二重処理にはならない）。
        if (e.key === "Escape") {
          e.preventDefault();
          void logUiEvent("[window-keydown] key=Escape");
          search.cancelSystemCommand();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    iconMeasureOverlayOpen,
    showSettings,
    favoriteEditOpen,
    search.pendingCommand,
    search.cancelSystemCommand,
    search.favoriteDialogTarget,
    search.closeFavoriteDialog,
    search.pendingDeleteFavoriteFolder,
    openSettings,
    closeSettings,
    closeFavoriteEdit,
    favoriteEdit.tree,
    favoriteEdit.selected,
    favoriteEdit.moveSelection,
    search.toggleFavoriteFolderCollapsedInEdit,
    setRenamingFavoriteNodeId,
    startCreateFolder,
    moveFavoriteNodeWithinParent,
    indentFavoriteNode,
    outdentFavoriteNode,
    requestDeleteFavoriteEditFolder,
    toggleFavoriteFromEditView,
    ocrActive,
    handleOcrClose,
    search.setQuery,
    search.pathPasteWizardMode,
    search.wizardStep,
    search.wizardFolders,
    search.selected,
    search.setSelected,
    search.wizardBack,
    search.selectWizardFolder,
    search.confirmShortcut,
    search.cancelDeleteFavoriteFolder,
  ]);

  // ピンアイコンはファイル検索結果の行、および /recent（最近使ったファイル一覧）の
  // 行の両方に表示する。/recent は同じ results state・同じ ResultList の "file" kind
  // 行レンダリングを共有しており（recentResults が results へコピーされる）、
  // useSearch.ts の rows 構築ロジックも由来を区別せず row.pinned を埋め込むため、
  // recentMode による特例分岐はここでは不要（REQUIREMENTS.md「ピン止め・お気に入り・
  // メモ機能」節「ピンアイコン」「/recent からのピン止め」を参照）。
  const pinIconVisible = settings.appSettings.pinEnabled;
  // ★アイコンの表示条件。pinIconVisible と同じ考え方（favoriteEnabled が false の
  // 場合は検索結果行・/recent・ピン止めブロックのいずれでも★を表示しない）。
  const favoriteIconVisible = settings.appSettings.favoriteEnabled;
  // Web検索行は rows に含まれない（rows・並び順の正本は useSearch.ts。詳細は
  // CLAUDE.md「結果行のフラット配列化（R-1）」節を参照）。baseLength は「Web検索行を
  // 除いた、現在アクティブな一覧の件数」を表す値で、通常モードでは rows の並び順が
  // 既存の優先順序をそのまま体現しているため search.rows.length がそのままこの件数に
  // なる（かつて個別に持っていた pinnedLength/pathPasteLength/calcLength/
  // urlConvertLength とその合算は不要になり撤去した）。clipboardMode・
  // prefixCommandMode・pathPasteWizardMode は rows を使わない別系統の一覧のため、
  // 従来通りそれぞれの件数をそのまま使う（ResultList.tsx は今回変更していないため、
  // baseLength という名前・意味は props としてそのまま渡し続ける必要がある）。
  const baseLength = search.clipboardMode
    ? clipboard.clipboardEntries.length
    : search.prefixCommandMode
      ? search.prefixCommandCandidates.length
      : search.pathPasteWizardMode
        ? search.wizardStep === "folderSelect"
          ? search.wizardFolders.length
          : 0
        : search.favoriteMode
          ? search.favoriteTree.length
          : search.rows.length;
  const webSearchVisible =
    settings.appSettings.webSearchEnabled &&
    search.query.trim().length > 0 &&
    !search.clipboardMode &&
    !search.pathPasteWizardMode &&
    !search.favoriteMode;
  const listLength = baseLength + (webSearchVisible ? 1 : 0);

  // 通常モードで現在選択中の行（rows[selected]）。rows に該当する行がない場合
  // （rows が空、selected が Web検索行の位置・範囲外等）は null。StatusFooter の
  // キーヒント表示・handleKeyDown の Enter/Shift+Enter 分岐の両方で、この行の
  // kind を見て判定する（詳細は CLAUDE.md「結果行のフラット配列化（R-1）」節を参照）。
  const selectedRow = search.rows[search.selected] ?? null;
  // /favorite モード専用の選択中の行（フォルダ見出し行・アイテム行のどちらも
  // ありうる。軸1で favoriteTree が選択ドメインになったため、search.selected を
  // そのまま favoriteTree の添字として使える）。kind で分岐して扱う。
  const selectedFavoriteRow = search.favoriteMode
    ? (search.favoriteTree[search.selected] ?? null)
    : null;

  // R-1 フェーズD-2: ↑↓キーによる選択は、通常モード（rows）・clipboardMode
  // （clipboard.clipboardEntries）については intent の更新のみで表現する
  // （selected への直接書き込みは行わない。詳細は useSearch.ts の SelectIntent
  // 型のコメントを参照）。「次に選ぶべき行が何番目か」自体は既存の
  // listLength/selected を使った計算のまま変更していない。その番号が指す対象の
  // 識別子（key）を求めてから intent を更新する、という2段階にしているだけ。
  // prefixCommandMode・Web検索行の位置（selected === baseLength）は intent 化の
  // 対象外のため、従来通り生インデックスを直接書き込む
  // （選択管理そのものは今回変更していない）。
  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      const nextIndex =
        direction === 1
          ? Math.min(search.selected + 1, listLength - 1)
          : Math.max(search.selected - 1, 0);

      if (search.prefixCommandMode) {
        search.setSelected(nextIndex);
        return;
      }
      if (search.clipboardMode) {
        const entry = clipboard.clipboardEntries[nextIndex];
        if (entry) {
          search.selectRowByKeyboard(entry.id);
        }
        return;
      }
      if (search.favoriteMode) {
        // 軸1：フォルダ見出し行・アイテム行の両方を対象に移動する
        // （REQUIREMENTS.md「/favorite モード」節を参照）。
        const row = search.favoriteTree[nextIndex];
        if (row) {
          search.selectRowByKeyboard(row.key);
        }
        return;
      }
      if (webSearchVisible && nextIndex === baseLength) {
        // Web検索行は rows に含まれない（フェーズEの対象）。今回は現状の
        // 生インデックス書き込みのまま維持する。
        search.setSelected(nextIndex);
        return;
      }
      const row = search.rows[nextIndex];
      if (row) {
        search.selectRowByKeyboard(row.key);
      }
    },
    [
      search.selected,
      listLength,
      search.prefixCommandMode,
      search.setSelected,
      search.clipboardMode,
      clipboard.clipboardEntries,
      search.favoriteMode,
      search.favoriteTree,
      search.selectRowByKeyboard,
      webSearchVisible,
      baseLength,
      search.rows,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (search.searchOverlayActive) {
        // 400_テスト・バグ修正：システムコマンド確認・パス貼り付けウィザード・
        // 登録ダイアログ・フォルダ削除確認モーダルのいずれの表示中も、Enter/Escape
        // はこのReact onKeyDown（SearchBoxの合成イベント）ではなく window レベルの
        // keydown リスナーに一本化している（登録ダイアログのみ、ダイアログ自身の
        // 入力欄が自己完結で処理し、window レベルはEscapeの保険用）。理由は
        // オーバーレイの種類によって異なる（フォーカスが行の `<button>` に残留する・
        // SearchBoxがdisabledになる等）ため、個別の理由は
        // docs/internal-design/window-lifecycle.md の該当節と App.tsx の window レベル
        // keydown リスナー側のコメントを参照。ここでは二重ハンドラによる
        // リグレッション再発防止のため何もしない（CLAUDE.md
        // 「複数ステップのウィザード形式インタラクション」節を参照）。
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveSelection(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveSelection(-1);
          break;
        case "Enter": {
          if (e.shiftKey) {
            // Shift+Enter は格納フォルダを開く操作専用。ピン止めブロック・
            // ファイル検索結果（rows の kind "pinned"/"file"）・/favorite モードの
            // アイテム行以外（パス貼り付け候補・計算結果・URLエンコード/デコード
            // 結果・システムコマンド候補・クリップボード履歴・プレフィックスコマンド
            // 候補・Web検索行）はファイルパスを持たないため、該当する場合のみ実行する
            // （REQUIREMENTS.md「ピン止め・お気に入り・メモ機能」節・
            // 「格納フォルダを開く（Shift+Enter）」節を参照）。フォルダ見出し行では
            // 無効（何もしない。REQUIREMENTS.md「/favorite モード」節を参照）。
            if (search.favoriteMode) {
              if (selectedFavoriteRow?.kind === "item") {
                search.openContainingFolder(selectedFavoriteRow.file.path);
              }
            } else if (
              selectedRow &&
              (selectedRow.kind === "pinned" || selectedRow.kind === "file")
            ) {
              search.openContainingFolder(selectedRow.file.path);
            }
            break;
          }
          if (webSearchVisible && search.selected === baseLength) {
            search.openWebSearch(search.query);
          } else if (search.clipboardMode) {
            if (clipboard.clipboardEntries[search.selected]) {
              clipboard.selectClipboardEntry(
                clipboard.clipboardEntries[search.selected]
              );
            }
          } else if (search.prefixCommandMode) {
            if (search.prefixCommandCandidates[search.selected]) {
              search.selectPrefixCommand(
                search.prefixCommandCandidates[search.selected]
              );
            }
          } else if (search.favoriteMode) {
            // フォルダ見出し行では開閉をトグルする（▼クリックのイベント発火を
            // 疑似的に模倣せず、onToggleCollapse を直接呼ぶ。REQUIREMENTS.md
            // 「/favorite モード」節を参照）。アイテム行では従来通り起動する。
            if (selectedFavoriteRow?.kind === "item") {
              search.launchFile(selectedFavoriteRow.file.path);
            } else if (selectedFavoriteRow?.kind === "folder") {
              search.toggleFavoriteFolderCollapsed(selectedFavoriteRow.node.id);
            }
          } else if (selectedRow) {
            switch (selectedRow.kind) {
              case "pinned":
              case "file":
                search.launchFile(selectedRow.file.path);
                break;
              case "pathPasteShortcut":
                search.startShortcutWizard();
                break;
              case "pathPasteAddFolder":
                search.addSearchFolderFromPaste();
                break;
              case "calc":
                search.copyResult(selectedRow.result);
                break;
              case "urlConvert":
                search.copyUrlConvertResult(selectedRow.result.text);
                break;
            }
          }
          break;
        }
        case "Escape":
          hideWindow();
          break;
      }
    },
    [
      search.searchOverlayActive,
      moveSelection,
      webSearchVisible,
      search.selected,
      baseLength,
      search.openWebSearch,
      search.query,
      search.clipboardMode,
      clipboard.clipboardEntries,
      clipboard.selectClipboardEntry,
      search.copyResult,
      search.prefixCommandMode,
      search.prefixCommandCandidates,
      search.selectPrefixCommand,
      search.copyUrlConvertResult,
      selectedRow,
      search.launchFile,
      search.openContainingFolder,
      search.startShortcutWizard,
      search.addSearchFolderFromPaste,
      search.favoriteMode,
      search.toggleFavoriteFolderCollapsed,
      selectedFavoriteRow,
    ]
  );

  // フォーカスアウトで自動非表示、フォーカスインでは検索欄の内容を保持したまま再フォーカス
  // （グローバルホットキーでの再表示は Rust 側で window.hide/show するため、
  //   フロントエンドの state はここでリセットする必要がある）
  //
  // WebView2 はウィンドウ内のクリック（設定パネルへの切り替えによる DOM 入れ替えや
  // ドラッグ開始操作など）でも一時的にフォーカスを失う通知を送ることがあるため、
  // 即時に hide() せず、一定時間後も本当にフォーカスが戻っていない場合のみ非表示にする。
  //
  // 設定画面表示中はこの自動非表示自体を適用しない（REQUIREMENTS.md「キー操作」＞
  // 「フォーカスアウト時自動非表示の例外（設定画面表示中）」節を参照）。3枚目の
  // お気に入り編集ビュー表示中も同じ理由（検索UI自体が表示されていない）で適用
  // しない。判定は viewRef（毎レンダーで最新の view を書き込む ref）で行う。
  // openSettings/closeSettings/openFavoriteEdit/closeFavoriteEdit はいずれも単一の
  // view state を介するため、開閉の経路（歯車・編集アイコン・Ctrl+S・Esc・各ビューの
  // 戻るボタン）を個別にフックする必要はなく、この ref を見るだけで全経路に
  // 自動的に追従する。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const clearBlurTimer = () => {
      if (blurTimer !== undefined) {
        clearTimeout(blurTimer);
        blurTimer = undefined;
      }
    };

    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          clearBlurTimer();
          inputRef.current?.focus();
        } else {
          clearBlurTimer();
          blurTimer = setTimeout(async () => {
            const stillFocused = await getCurrentWindow()
              .isFocused()
              .catch(() => false);
            if (stillFocused || viewRef.current !== "search") return;
            const store = storeRef.current;
            if (store) {
              await store.set(
                "clipboardPaneWidth",
                clipboardPaneWidthRef.current
              );
              await store.save();
            }
            hideWindow();
          }, 150);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      clearBlurTimer();
      unlisten?.();
    };
  }, []);

  if (showSettings) {
    return (
      <>
        <SettingsPanel
          appSettings={settings.appSettings}
          onSaveHotkey={hotkey.setHotkey}
          onSetFileSearchEnabled={settings.setFileSearchEnabled}
          onSetCalcEnabled={settings.setCalcEnabled}
          onSetCopyWithComma={settings.setCopyWithComma}
          onSetUrlConvertEnabled={settings.setUrlConvertEnabled}
          onSetUrlConvertKeepSpaceEncoded={settings.setUrlConvertKeepSpaceEncoded}
          onSetSystemCommandEnabled={settings.setSystemCommandEnabled}
          onSetSystemCommandKeyword={settings.setSystemCommandKeyword}
          onSetWebSearchEnabled={settings.setWebSearchEnabled}
          onSetClipboardEnabled={settings.setClipboardEnabled}
          onSetClipboardPrefix={settings.setClipboardPrefix}
          onSetClipboardMaxItems={settings.setClipboardMaxItems}
          onSetRecentFilesEnabled={settings.setRecentFilesEnabled}
          onSetRecentKeyword={settings.setRecentKeyword}
          onSetRecentMaxAgeDays={settings.setRecentMaxAgeDays}
          onSetRecentMaxResults={settings.setRecentMaxResults}
          onSaveRecentDisplaySettings={settings.setRecentDisplaySettings}
          onSetOcrEnabled={settings.setOcrEnabled}
          onSetCheckUpdateOnStartup={settings.setCheckUpdateOnStartup}
          onSetPathPasteEnabled={settings.setPathPasteEnabled}
          onSetPinEnabled={settings.setPinEnabled}
          onSetFavoriteEnabled={settings.setFavoriteEnabled}
          onSetFavoriteKeyword={settings.setFavoriteKeyword}
          folders={settings.folders}
          onAddFolder={settings.addFolder}
          onToggleFolder={settings.toggleFolder}
          onRemoveFolder={settings.removeFolder}
          onOpenFolder={settings.openFolder}
          onSaveFolderSettings={settings.setFolderSettings}
          onClose={closeSettings}
          version={appVersion}
        />
        {iconMeasureOverlayOpen && (
          <IconSlotMeasureOverlay
            onClose={() => setIconMeasureOverlayOpen(false)}
          />
        )}
      </>
    );
  }

  if (favoriteEditOpen) {
    return (
      <>
        <FavoriteEditView
          tree={favoriteEdit.tree}
          selected={favoriteEdit.selected}
          onSelectRowByKey={favoriteEdit.selectByKey}
          onToggleCollapse={search.toggleFavoriteFolderCollapsedInEdit}
          filterText={search.favoriteEditFilterText}
          onFilterTextChange={search.setFavoriteEditFilterText}
          onCreateFolder={search.createFavoriteFolder}
          onFolderCreated={handleFavoriteEditFolderCreated}
          creatingFolderAnchorKey={creatingFolderAnchorKey}
          onStartCreateFolder={startCreateFolder}
          onCancelCreateFolder={cancelCreateFolder}
          onRequestDeleteFolder={requestDeleteFavoriteEditFolder}
          pendingDeleteFolder={search.pendingDeleteFavoriteFolder}
          onCancelDeleteFolder={search.cancelDeleteFavoriteFolder}
          onConfirmDeleteFolder={search.confirmDeleteFavoriteFolder}
          onToggleFavorite={toggleFavoriteFromEditView}
          onMoveNode={search.moveFavoriteNodeTo}
          renamingNodeId={renamingFavoriteNodeId}
          onStartRename={setRenamingFavoriteNodeId}
          onCancelRename={cancelRenameFavoriteNode}
          onConfirmRename={confirmRenameFavoriteNode}
          onClose={closeFavoriteEdit}
          version={appVersion}
        />
        {iconMeasureOverlayOpen && (
          <IconSlotMeasureOverlay
            onClose={() => setIconMeasureOverlayOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div
      className={`relative flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl transition-opacity duration-[180ms] ${
        ocrClosing ? "opacity-0" : "opacity-100"
      }`}
      onMouseMove={(e) => search.recordMouseMove(e.clientX, e.clientY)}
    >
      {iconMeasureOverlayOpen && (
        <IconSlotMeasureOverlay
          onClose={() => setIconMeasureOverlayOpen(false)}
        />
      )}
      {/* システムコマンド確認モーダル */}
      {search.pendingCommand && (
        <SystemCommandModal
          command={search.pendingCommand}
          onCancel={search.cancelSystemCommand}
          onConfirm={search.confirmSystemCommand}
        />
      )}

      {/* アップデート確認/インストールダイアログ */}
      {updater.dialog && (
        <UpdateDialog
          state={updater.dialog}
          onInstall={updater.installUpdate}
          onDismiss={updater.dismiss}
        />
      )}

      {/* お気に入り登録ダイアログ（★を押した未登録行から開く。段階5の /memo でも
          同じ RegisterEntryDialog を再利用する想定のため、お気に入り固有の文言・
          データはすべてここで props として与える）。 */}
      {search.favoriteDialogTarget && (
        <RegisterEntryDialog
          title="お気に入りに登録"
          initialName={search.favoriteDialogTarget.name}
          folderOptions={search.favoriteFolderOptions}
          initialFolderId={search.lastFavoriteFolderId}
          onCancel={search.closeFavoriteDialog}
          onSave={search.confirmFavoriteDialog}
          onCreateFolder={search.createFavoriteFolder}
        />
      )}

      {/* フォルダ削除確認モーダル（配下が空でない場合のみ表示）。/favorite
          ブラウジングの暫定UI・お気に入り編集ビューの両方で共有する
          （FavoriteFolderDeleteModal.tsx を参照）。 */}
      {search.pendingDeleteFavoriteFolder && (
        <FavoriteFolderDeleteModal
          target={search.pendingDeleteFavoriteFolder}
          onCancel={search.cancelDeleteFavoriteFolder}
          onConfirm={search.confirmDeleteFavoriteFolder}
        />
      )}

      <SearchBox
        inputRef={inputRef}
        query={search.query}
        onQueryChange={search.setQuery}
        onKeyDown={handleKeyDown}
        disabled={search.searchOverlayActive}
        onOpenSettings={openSettings}
        favoriteEditVisible={search.favoriteMode}
        onOpenFavoriteEdit={openFavoriteEdit}
        onImagePaste={
          settings.appSettings.ocrEnabled ? ocr.runOcr : undefined
        }
        onPathPaste={
          settings.appSettings.pathPasteEnabled
            ? search.detectPastedPath
            : undefined
        }
      />

      {/* OCR プレビュー（画像ペースト時に表示。表示中は検索結果エリアを非表示にする） */}
      {/* key に ocrRunId を使い、新しい画像が貼り付けられるたびに再マウントして
          左右ペインの分割幅を 50:50 の初期状態にリセットする */}
      {ocrActive && (
        <OcrPreview
          key={ocr.ocrRunId}
          imageUrl={ocr.ocrImageUrl}
          loading={ocr.ocrLoading}
          text={ocr.ocrText}
          error={ocr.ocrError}
          onTextChange={ocr.setOcrText}
          onClose={handleOcrClose}
          onCopyAndClose={handleOcrCopyAndClose}
        />
      )}

      {/* 検索結果 / 計算結果 / クリップボード履歴 / パス貼り付けウィザード
          （OCR プレビュー中は非表示） */}
      {!ocrActive &&
        (search.clipboardMode ? (
          <ClipboardPanel
            entries={clipboard.clipboardEntries}
            selected={search.selected}
            onSelect={(index, clientX, clientY) => {
              // R-1 フェーズD-2: clipboardMode の選択も intent の更新のみで
              // 表現する。ClipboardPanel.tsx 自体は変更せず、渡ってくる生
              // インデックスをここで対象エントリの id（key）に変換してから
              // search.selectRowFromHover へ渡す（詳細は useSearch.ts の
              // SelectIntent 型のコメントを参照）。
              const entry = clipboard.clipboardEntries[index];
              if (entry) {
                search.selectRowFromHover(entry.id, clientX, clientY);
              }
            }}
            onSelectEntry={clipboard.selectClipboardEntry}
            initialLeftWidth={clipboardPaneWidth}
            onWidthChange={handlePaneWidthChange}
          />
        ) : search.pathPasteWizardMode ? (
          <PathPasteWizard
            step={search.wizardStep}
            folders={search.wizardFolders}
            selected={search.selected}
            onSelect={search.selectFromHover}
            onSelectFolder={search.selectWizardFolder}
            name={search.wizardName}
            onNameChange={search.setWizardName}
          />
        ) : search.favoriteMode ? (
          <FavoriteListPanel
            tree={search.favoriteTree}
            selected={search.selected}
            onSelectRowByKey={search.selectRowFromHover}
            onToggleCollapse={search.toggleFavoriteFolderCollapsed}
            onToggleFavorite={search.toggleFavorite}
            onLaunchFile={search.launchFile}
          />
        ) : (
          <ResultList
            rows={search.rows}
            pinIconVisible={pinIconVisible}
            favoriteIconVisible={favoriteIconVisible}
            onTogglePin={search.togglePin}
            onToggleFavorite={search.toggleFavorite}
            onReorderPinned={search.reorderPinned}
            prefixCommandMode={search.prefixCommandMode}
            prefixCommandCandidates={search.prefixCommandCandidates}
            results={search.results}
            query={search.query}
            selected={search.selected}
            baseLength={baseLength}
            webSearchVisible={webSearchVisible}
            onSelect={search.selectFromHover}
            onSelectRowByKey={search.selectRowFromHover}
            onAddSearchFolder={search.addSearchFolderFromPaste}
            onStartShortcutWizard={search.startShortcutWizard}
            onCopyResult={search.copyResult}
            onSelectPrefixCommand={search.selectPrefixCommand}
            onLaunchFile={search.launchFile}
            onOpenWebSearch={search.openWebSearch}
            onCopyUrlConvertResult={search.copyUrlConvertResult}
          />
        ))}

      {/* フッター（OCR プレビュー中は非表示） */}
      {!ocrActive && (
        <StatusFooter
          pendingCommand={search.pendingCommand !== null}
          webSearchVisible={webSearchVisible}
          isWebSearchSelected={search.selected === baseLength}
          clipboardMode={search.clipboardMode}
          pathPasteWizardStep={
            search.pathPasteWizardMode ? search.wizardStep : null
          }
          prefixCommandMode={search.prefixCommandMode}
          selectedRowKind={selectedRow?.kind ?? null}
          favoriteSelectedKind={selectedFavoriteRow?.kind ?? null}
          version={appVersion}
        />
      )}
    </div>
  );
}
