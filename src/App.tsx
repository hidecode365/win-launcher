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
    search.setQuery
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

  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setSettingsVersion((v) => v + 1);
    hotkey.resetHotkeyError();
    settings.resetClipboardSettingsError();
    settings.resetRecentSettingsError();
    settings.resetSystemCommandKeywordErrors();
  }, [
    hotkey.resetHotkeyError,
    settings.resetClipboardSettingsError,
    settings.resetRecentSettingsError,
    settings.resetSystemCommandKeywordErrors,
  ]);

  // 設定パネルの開閉は document レベルの keydown で処理する。
  // input 要素のローカル onKeyDown に持たせると、フォーカス状態や
  // WebView2 の Ctrl+S 既定動作（ページ保存）の影響で発火しないことがあるため、
  // 開く方向・閉じる方向の両方を同じ仕組みに統一している。
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSettings, search.pendingCommand, openSettings, closeSettings]);

  const calcLength = search.calcResult !== null ? 1 : 0;
  const urlConvertLength = search.urlConvertResult !== null ? 1 : 0;
  const baseLength = search.clipboardMode
    ? clipboard.clipboardEntries.length
    : search.prefixCommandMode
      ? search.prefixCommandCandidates.length
      : search.results.length + calcLength + urlConvertLength;
  const webSearchVisible =
    settings.appSettings.webSearchEnabled &&
    search.query.trim().length > 0 &&
    !search.clipboardMode;
  const listLength = baseLength + (webSearchVisible ? 1 : 0);

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
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          search.setSelected((s) => Math.min(s + 1, listLength - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          search.setSelected((s) => Math.max(s - 1, 0));
          break;
        case "Enter":
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
          } else if (search.calcResult !== null && search.selected === 0) {
            search.copyResult(search.calcResult);
          } else if (
            search.urlConvertResult !== null &&
            search.selected === calcLength
          ) {
            search.copyUrlConvertResult(search.urlConvertResult.text);
          } else if (
            search.results[search.selected - calcLength - urlConvertLength]
          ) {
            search.launchFile(
              search.results[search.selected - calcLength - urlConvertLength]
                .path
            );
          }
          break;
        case "Escape":
          hideWindow();
          break;
      }
    },
    [
      search.pendingCommand,
      search.confirmSystemCommand,
      search.cancelSystemCommand,
      listLength,
      search.setSelected,
      webSearchVisible,
      search.selected,
      baseLength,
      search.openWebSearch,
      search.query,
      search.clipboardMode,
      clipboard.clipboardEntries,
      clipboard.selectClipboardEntry,
      calcLength,
      search.calcResult,
      search.copyResult,
      search.prefixCommandMode,
      search.prefixCommandCandidates,
      search.selectPrefixCommand,
      search.urlConvertResult,
      search.copyUrlConvertResult,
      urlConvertLength,
      search.results,
      search.launchFile,
    ]
  );

  // フォーカスアウトで自動非表示、フォーカスインでは検索欄の内容を保持したまま再フォーカス
  // （グローバルホットキーでの再表示は Rust 側で window.hide/show するため、
  //   フロントエンドの state はここでリセットする必要がある）
  //
  // WebView2 はウィンドウ内のクリック（設定パネルへの切り替えによる DOM 入れ替えや
  // ドラッグ開始操作など）でも一時的にフォーカスを失う通知を送ることがあるため、
  // 即時に hide() せず、一定時間後も本当にフォーカスが戻っていない場合のみ非表示にする。
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
            if (!stillFocused) {
              const store = storeRef.current;
              if (store) {
                await store.set(
                  "clipboardPaneWidth",
                  clipboardPaneWidthRef.current
                );
                await store.save();
              }
              hideWindow();
            }
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
        hotkeyError={hotkey.hotkeyError}
        onSaveHotkey={hotkey.setHotkey}
        onSetFileSearchEnabled={settings.setFileSearchEnabled}
        onSetCalcEnabled={settings.setCalcEnabled}
        onSetCopyWithComma={settings.setCopyWithComma}
        onSetUrlConvertEnabled={settings.setUrlConvertEnabled}
        onSetUrlConvertKeepSpaceEncoded={settings.setUrlConvertKeepSpaceEncoded}
        onSetSystemCommandEnabled={settings.setSystemCommandEnabled}
        onSetSystemCommandKeyword={settings.setSystemCommandKeyword}
        systemCommandKeywordErrors={settings.systemCommandKeywordErrors}
        onSetWebSearchEnabled={settings.setWebSearchEnabled}
        onSetClipboardEnabled={settings.setClipboardEnabled}
        onSetClipboardPrefix={settings.setClipboardPrefix}
        onSetClipboardMaxItems={settings.setClipboardMaxItems}
        clipboardSettingsError={settings.clipboardSettingsError}
        onSetRecentFilesEnabled={settings.setRecentFilesEnabled}
        onSetRecentKeyword={settings.setRecentKeyword}
        onSetRecentMaxAgeDays={settings.setRecentMaxAgeDays}
        onSetRecentMaxResults={settings.setRecentMaxResults}
        recentSettingsError={settings.recentSettingsError}
        onSetOcrEnabled={settings.setOcrEnabled}
        onSetCheckUpdateOnStartup={settings.setCheckUpdateOnStartup}
        folders={settings.folders}
        onAddFolder={settings.addFolder}
        onToggleFolder={settings.toggleFolder}
        onRemoveFolder={settings.removeFolder}
        onOpenFolder={settings.openFolder}
        onClose={closeSettings}
      />
    );
  }

  const ocrActive =
    ocr.ocrLoading || ocr.ocrText !== null || ocr.ocrError !== null;

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
        disabled={search.pendingCommand !== null}
        onOpenSettings={openSettings}
        onImagePaste={
          settings.appSettings.ocrEnabled ? ocr.runOcr : undefined
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

      {/* 検索結果 / 計算結果 / クリップボード履歴（OCR プレビュー中は非表示） */}
      {!ocrActive &&
        (search.clipboardMode ? (
          <ClipboardPanel
            entries={clipboard.clipboardEntries}
            selected={search.selected}
            onSelect={search.selectFromHover}
            onSelectEntry={clipboard.selectClipboardEntry}
            initialLeftWidth={clipboardPaneWidth}
            onWidthChange={handlePaneWidthChange}
          />
        ) : (
          <ResultList
            calcResult={search.calcResult}
            prefixCommandMode={search.prefixCommandMode}
            prefixCommandCandidates={search.prefixCommandCandidates}
            results={search.results}
            urlConvertResult={search.urlConvertResult}
            query={search.query}
            selected={search.selected}
            baseLength={baseLength}
            webSearchVisible={webSearchVisible}
            onSelect={search.selectFromHover}
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
          isCalcSelected={
            search.calcResult !== null && search.selected === 0
          }
          prefixCommandMode={search.prefixCommandMode}
          isUrlConvertSelected={
            search.urlConvertResult !== null && search.selected === calcLength
          }
        />
      )}
    </div>
  );
}
