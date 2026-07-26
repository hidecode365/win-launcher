import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { useSettings } from "./hooks/useSettings";
import { useHotkey } from "./hooks/useHotkey";
import { useSearch } from "./hooks/useSearch";
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
import { UpdateDialog } from "./components/UpdateDialog";
import { StatusFooter } from "./components/StatusFooter";
import { hideWindow } from "./lib/window";
import type { ClipboardTextEntry, FrecencyMap } from "./types";

const DEFAULT_CLIPBOARD_PANE_WIDTH = 224;

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [ocrClosing, setOcrClosing] = useState(false);
  const [clipboardPaneWidth, setClipboardPaneWidth] = useState(
    DEFAULT_CLIPBOARD_PANE_WIDTH
  );
  const clipboardPaneWidthRef = useRef(DEFAULT_CLIPBOARD_PANE_WIDTH);
  const storeRef = useRef<Store | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // フォーカスアウト時自動非表示の判定用（後述のフォーカス監視 useEffect は依存配列が
  // 空で一度しかマウントされないため、showSettings state を直接参照すると初回値の
  // 古いクロージャのままになる。毎レンダーで最新値を書き込むこの ref を代わりに参照する）
  const showSettingsRef = useRef(showSettings);
  showSettingsRef.current = showSettings;

  const settings = useSettings(showSettings);
  const hotkey = useHotkey(settings.setAppSettings);
  const search = useSearch(settings.appSettings, settingsVersion, storeRef);
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
    if (!showSettings) {
      inputRef.current?.focus();
    }
  }, [showSettings]);

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
  // リサイズ確定から 500ms デバウンスしたうえで settings.json の "windowSize" へ
  // 論理ピクセルで書き込む。適用（読み込み・反映）は Rust 側の起動時処理が担う。
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
          await store.set("windowSize", {
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
    setShowSettings(true);
  }, []);

  // 設定パネル内の各タブのバリデーションエラー（ホットキー・システムコマンドの
  // キーワード・クリップボード・最近使ったファイル・フォルダ詳細設定）は、それぞれの
  // タブ／モーダルコンポーネントのローカル state として保持している。SettingsPanel は
  // パネルを閉じるとまるごと unmount されるため、ここで個別にリセットする必要はない
  // （タブ切り替え時に各タブが unmount される際も同じ理由で自動的に破棄される。詳細は
  // CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setSettingsVersion((v) => v + 1);
  }, []);

  // 設定パネルの開閉・クエリ全クリア（Ctrl+D）・パス貼り付けウィザードのフォルダ選択
  // ステップの操作は document レベルの keydown で処理する。input 要素のローカル
  // onKeyDown に持たせると、フォーカス状態や WebView2 のブラウザ既定動作（Ctrl+S の
  // ページ保存、Ctrl+D のブックマーク追加）の影響で発火しないことがあるため、この
  // 一箇所に統一している。
  // Ctrl+D は OCR プレビュー表示中のみ「閉じる」ボタン（handleOcrClose）と同一の処理を
  // 呼び、それ以外の全モードでは現在のモードに関わらずクエリを問答無用で空文字にする
  // （ウィンドウは閉じないため closeWindow は経由しない。closeRefreshTick の加算も
  // 不要：query 自体が変化するので検索用 useEffect は通常通り再トリガーされる）。
  // 検索 UI そのものが表示されていない設定パネル表示中（showSettings）は対象外とする。
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
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        if (showSettings) {
          closeSettings();
        } else if (!search.pendingCommand) {
          openSettings();
        }
      } else if (e.key === "Escape" && showSettings) {
        closeSettings();
      } else if (!showSettings && e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        e.stopPropagation();
        if (ocrActive) {
          handleOcrClose();
        } else {
          search.setQuery("");
        }
      } else if (!showSettings && search.pathPasteWizardMode) {
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    showSettings,
    search.pendingCommand,
    openSettings,
    closeSettings,
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
  ]);

  // ピンアイコンはファイル検索結果の行、および /recent（最近使ったファイル一覧）の
  // 行の両方に表示する。/recent は同じ results state・同じ ResultList の "file" kind
  // 行レンダリングを共有しており（recentResults が results へコピーされる）、
  // useSearch.ts の rows 構築ロジックも由来を区別せず row.pinned を埋め込むため、
  // recentMode による特例分岐はここでは不要（REQUIREMENTS.md「ピン止め・お気に入り・
  // メモ機能」節「ピンアイコン」「/recent からのピン止め」を参照）。
  const pinIconVisible = settings.appSettings.pinEnabled;
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
        : search.rows.length;
  const webSearchVisible =
    settings.appSettings.webSearchEnabled &&
    search.query.trim().length > 0 &&
    !search.clipboardMode &&
    !search.pathPasteWizardMode;
  const listLength = baseLength + (webSearchVisible ? 1 : 0);

  // 通常モードで現在選択中の行（rows[selected]）。rows に該当する行がない場合
  // （rows が空、selected が Web検索行の位置・範囲外等）は null。StatusFooter の
  // キーヒント表示・handleKeyDown の Enter/Shift+Enter 分岐の両方で、この行の
  // kind を見て判定する（詳細は CLAUDE.md「結果行のフラット配列化（R-1）」節を参照）。
  const selectedRow = search.rows[search.selected] ?? null;

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
      search.selectRowByKeyboard,
      webSearchVisible,
      baseLength,
      search.rows,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (search.pendingCommand) {
        if (e.key === "Enter") {
          e.preventDefault();
          search.confirmSystemCommand();
        } else if (e.key === "Escape") {
          e.preventDefault();
          search.cancelSystemCommand();
        }
        return;
      }
      if (search.pathPasteWizardMode) {
        // ウィザードの操作（フォルダ選択ステップの ↑↓・Enter・Escape、名前編集
        // ステップの Escape）は、SearchBox の focus 状態に依存しない window レベルの
        // keydown リスナー（またはステップ3専用の入力欄自身）で処理する。フォルダ選択
        // ステップの各行は SearchBox とは別の <button> であり、Enter 確定直後や行の
        // クリックでフォーカスが SearchBox から外れうるため（詳細は該当 useEffect の
        // コメントを参照）。
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
            // ファイル検索結果（rows の kind "pinned"/"file"）以外（パス貼り付け
            // 候補・計算結果・URLエンコード/デコード結果・システムコマンド候補・
            // クリップボード履歴・プレフィックスコマンド候補・Web検索行）は
            // ファイルパスを持たないため、該当する場合のみ実行する
            // （REQUIREMENTS.md「ピン止め・お気に入り・メモ機能」節を参照）。
            if (
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
      search.pendingCommand,
      search.confirmSystemCommand,
      search.cancelSystemCommand,
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
      search.pathPasteWizardMode,
      search.startShortcutWizard,
      search.addSearchFolderFromPaste,
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
  // 「フォーカスアウト時自動非表示の例外（設定画面表示中）」節を参照）。判定は
  // showSettingsRef（毎レンダーで最新の showSettings を書き込む ref）で行う。
  // openSettings/closeSettings はいずれも単一の showSettings state を介するため、
  // 開閉の経路（歯車アイコン・Ctrl+S・Esc・設定パネルの閉じるボタン）を個別に
  // フックする必要はなく、この ref を見るだけで全経路に自動的に追従する。
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
            if (stillFocused || showSettingsRef.current) return;
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
        folders={settings.folders}
        onAddFolder={settings.addFolder}
        onToggleFolder={settings.toggleFolder}
        onRemoveFolder={settings.removeFolder}
        onOpenFolder={settings.openFolder}
        onSaveFolderSettings={settings.setFolderSettings}
        onClose={closeSettings}
      />
    );
  }

  return (
    <div
      className={`relative flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl transition-opacity duration-[180ms] ${
        ocrClosing ? "opacity-0" : "opacity-100"
      }`}
      onMouseMove={(e) => search.recordMouseMove(e.clientX, e.clientY)}
    >
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

      <SearchBox
        inputRef={inputRef}
        query={search.query}
        onQueryChange={search.setQuery}
        onKeyDown={handleKeyDown}
        disabled={search.pendingCommand !== null || search.pathPasteWizardMode}
        onOpenSettings={openSettings}
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
        ) : (
          <ResultList
            rows={search.rows}
            pinIconVisible={pinIconVisible}
            onTogglePin={search.togglePin}
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
        />
      )}
    </div>
  );
}
