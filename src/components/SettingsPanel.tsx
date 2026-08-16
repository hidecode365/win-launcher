import { useState } from "react";
import {
  AppSettings,
  FolderDetailSettings,
  FolderEntry,
  RecentDisplaySettings,
  SystemCommandAction,
} from "../types";
import { GeneralSettings } from "./GeneralSettings";
import { FileSearchSettings } from "./FileSearchSettings";
import { FavoriteSettings } from "./FavoriteSettings";
import { MemoSettings } from "./MemoSettings";
import { PathPasteSettings } from "./PathPasteSettings";
import { ConvertSettings } from "./ConvertSettings";
import { SystemCommandSettings } from "./SystemCommandSettings";
import { WebSearchSettings } from "./WebSearchSettings";
import { ClipboardSettings } from "./ClipboardSettings";
import { RecentFilesSettings } from "./RecentFilesSettings";
import { OcrSettings } from "./OcrSettings";
import { AboutSettings } from "./AboutSettings";
import { Tooltip } from "./Tooltip";
import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

type SettingsTab =
  | "general"
  | "fileSearch"
  | "favorite"
  | "memo"
  | "pathPaste"
  | "convert"
  | "systemCommand"
  | "webSearch"
  | "clipboard"
  | "recent"
  | "ocr"
  | "about";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "全般" },
  { id: "fileSearch", label: "ファイル検索" },
  { id: "favorite", label: "お気に入り" },
  { id: "memo", label: "メモ" },
  { id: "pathPaste", label: "パス貼り付け" },
  { id: "convert", label: "計算・変換" },
  { id: "systemCommand", label: "システムコマンド" },
  { id: "webSearch", label: "Web検索" },
  { id: "clipboard", label: "クリップボード" },
  { id: "recent", label: "最近使ったファイル" },
  { id: "ocr", label: "OCR" },
  { id: "about", label: "このアプリについて" },
];

export function SettingsPanel({
  appSettings,
  onSaveHotkey,
  onSetFileSearchEnabled,
  onSetCalcEnabled,
  onSetCopyWithComma,
  onSetUrlConvertEnabled,
  onSetUrlConvertKeepSpaceEncoded,
  onSetSystemCommandEnabled,
  onSetSystemCommandKeyword,
  onSetWebSearchEnabled,
  onSetClipboardEnabled,
  onSetClipboardPrefix,
  onSetClipboardMaxItems,
  onSetRecentFilesEnabled,
  onSetRecentKeyword,
  onSetRecentMaxAgeDays,
  onSetRecentMaxResults,
  onSaveRecentDisplaySettings,
  onSetOcrEnabled,
  onSetCheckUpdateOnStartup,
  onSetPathPasteEnabled,
  onSetPinEnabled,
  onSetFavoriteEnabled,
  onSetFavoriteKeyword,
  onSetMemoEnabled,
  onSetMemoKeyword,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
  onOpenFolder,
  onSaveFolderSettings,
  onClose,
  version,
}: {
  appSettings: AppSettings;
  onSaveHotkey: (accelerator: string) => Promise<string | null>;
  onSetFileSearchEnabled: (checked: boolean) => void;
  onSetCalcEnabled: (checked: boolean) => void;
  onSetCopyWithComma: (checked: boolean) => void;
  onSetUrlConvertEnabled: (checked: boolean) => void;
  onSetUrlConvertKeepSpaceEncoded: (checked: boolean) => void;
  onSetSystemCommandEnabled: (checked: boolean) => void;
  onSetSystemCommandKeyword: (
    command: SystemCommandAction,
    keyword: string
  ) => Promise<string | null>;
  onSetWebSearchEnabled: (checked: boolean) => void;
  onSetClipboardEnabled: (checked: boolean) => void;
  onSetClipboardPrefix: (prefix: string) => Promise<string | null>;
  onSetClipboardMaxItems: (maxItems: number) => Promise<string | null>;
  onSetRecentFilesEnabled: (checked: boolean) => void;
  onSetRecentKeyword: (keyword: string) => Promise<string | null>;
  onSetRecentMaxAgeDays: (days: number) => Promise<string | null>;
  onSetRecentMaxResults: (maxResults: number) => Promise<string | null>;
  onSaveRecentDisplaySettings: (
    detail: RecentDisplaySettings
  ) => Promise<string | null>;
  onSetOcrEnabled: (checked: boolean) => void;
  onSetCheckUpdateOnStartup: (checked: boolean) => void;
  onSetPathPasteEnabled: (checked: boolean) => void;
  onSetPinEnabled: (checked: boolean) => void;
  onSetFavoriteEnabled: (checked: boolean) => void;
  onSetFavoriteKeyword: (keyword: string) => Promise<string | null>;
  onSetMemoEnabled: (checked: boolean) => void;
  onSetMemoKeyword: (keyword: string) => Promise<string | null>;
  folders: FolderEntry[];
  onAddFolder: () => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onSaveFolderSettings: (
    path: string,
    detail: FolderDetailSettings
  ) => Promise<string | null>;
  onClose: () => void;
  // 軸4k：全画面共通のフッター右端バージョン番号表示に統一するため、
  // App.tsx側で一度だけ取得した値をpropsとして受け取る（以前はこのコンポーネント
  // 自身がgetVersion()を呼んでいた）。
  version: string;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div className="flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
      <div
        data-tauri-drag-region="deep"
        className="flex items-center px-4 py-3 border-b border-gray-200/60"
      >
        {/* 設定パネルの左上（px-4 の直後）に位置し、既定の左側表示では
            画面外にはみ出すため side="right" を指定する（詳細は CLAUDE.md
            「ピン止め・お気に入り・メモ機能」節を参照）。 */}
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </Tooltip>
        <span className="text-base font-medium text-gray-800">設定</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-36 flex-shrink-0 border-r border-gray-200/60 py-2 overflow-y-auto">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${
                tab === t.id
                  ? "bg-blue-50 text-blue-600 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "general" && (
            <GeneralSettings
              hotkey={appSettings.hotkey}
              onSave={onSaveHotkey}
              checkUpdateOnStartup={appSettings.checkUpdateOnStartup}
              onToggleCheckUpdateOnStartup={onSetCheckUpdateOnStartup}
              pinEnabled={appSettings.pinEnabled}
              onTogglePinEnabled={onSetPinEnabled}
            />
          )}
          {tab === "fileSearch" && (
            <FileSearchSettings
              enabled={appSettings.fileSearchEnabled}
              onToggle={onSetFileSearchEnabled}
              folders={folders}
              onAddFolder={onAddFolder}
              onToggleFolder={onToggleFolder}
              onRemoveFolder={onRemoveFolder}
              onOpenFolder={onOpenFolder}
              onSaveFolderSettings={onSaveFolderSettings}
            />
          )}
          {tab === "favorite" && (
            <FavoriteSettings
              enabled={appSettings.favoriteEnabled}
              onToggle={onSetFavoriteEnabled}
              keyword={appSettings.favoriteKeyword}
              onChangeKeyword={onSetFavoriteKeyword}
            />
          )}
          {tab === "memo" && (
            <MemoSettings enabled={appSettings.memoEnabled} onToggle={onSetMemoEnabled} keyword={appSettings.memoKeyword} onChangeKeyword={onSetMemoKeyword} />
          )}
          {tab === "pathPaste" && (
            <PathPasteSettings
              enabled={appSettings.pathPasteEnabled}
              onToggle={onSetPathPasteEnabled}
            />
          )}
          {tab === "convert" && (
            <ConvertSettings
              calcEnabled={appSettings.calcEnabled}
              onToggleCalc={onSetCalcEnabled}
              copyWithComma={appSettings.copyWithComma}
              onToggleCopyWithComma={onSetCopyWithComma}
              urlConvertEnabled={appSettings.urlConvertEnabled}
              onToggleUrlConvert={onSetUrlConvertEnabled}
              urlConvertKeepSpaceEncoded={appSettings.urlConvertKeepSpaceEncoded}
              onToggleUrlConvertKeepSpaceEncoded={onSetUrlConvertKeepSpaceEncoded}
            />
          )}
          {tab === "systemCommand" && (
            <SystemCommandSettings
              enabled={appSettings.systemCommandEnabled}
              onToggle={onSetSystemCommandEnabled}
              shutdownKeyword={appSettings.shutdownKeyword}
              restartKeyword={appSettings.restartKeyword}
              sleepKeyword={appSettings.sleepKeyword}
              onChangeKeyword={onSetSystemCommandKeyword}
            />
          )}
          {tab === "webSearch" && (
            <WebSearchSettings
              enabled={appSettings.webSearchEnabled}
              onToggle={onSetWebSearchEnabled}
            />
          )}
          {tab === "clipboard" && (
            <ClipboardSettings
              enabled={appSettings.clipboardEnabled}
              onToggle={onSetClipboardEnabled}
              prefix={appSettings.clipboardPrefix}
              onChangePrefix={onSetClipboardPrefix}
              maxItems={appSettings.clipboardMaxItems}
              onChangeMaxItems={onSetClipboardMaxItems}
            />
          )}
          {tab === "recent" && (
            <RecentFilesSettings
              enabled={appSettings.recentFilesEnabled}
              onToggle={onSetRecentFilesEnabled}
              keyword={appSettings.recentKeyword}
              onChangeKeyword={onSetRecentKeyword}
              maxAgeDays={appSettings.recentMaxAgeDays}
              onChangeMaxAgeDays={onSetRecentMaxAgeDays}
              maxResults={appSettings.recentMaxResults}
              onChangeMaxResults={onSetRecentMaxResults}
              includeFolders={appSettings.recentIncludeFolders}
              extensionFilterMode={appSettings.recentExtensionFilterMode}
              blacklistExtensions={appSettings.recentBlacklistExtensions}
              whitelistExtensions={appSettings.recentWhitelistExtensions}
              onSaveDisplaySettings={onSaveRecentDisplaySettings}
            />
          )}
          {tab === "ocr" && (
            <OcrSettings
              enabled={appSettings.ocrEnabled}
              onToggle={onSetOcrEnabled}
            />
          )}
          {tab === "about" && <AboutSettings />}
        </div>
      </div>

      <FooterBar version={version}>
        <KeyHint keys="Esc" label="閉じる" />
      </FooterBar>
    </div>
  );
}
