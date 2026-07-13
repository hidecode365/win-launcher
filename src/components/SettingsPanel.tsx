import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { AppSettings, FolderEntry } from "../types";
import { GeneralSettings } from "./GeneralSettings";
import { FileSearchSettings } from "./FileSearchSettings";
import { ConvertSettings } from "./ConvertSettings";
import { SystemCommandSettings } from "./SystemCommandSettings";
import { WebSearchSettings } from "./WebSearchSettings";
import { ClipboardSettings } from "./ClipboardSettings";
import { OcrSettings } from "./OcrSettings";

type SettingsTab =
  | "general"
  | "fileSearch"
  | "convert"
  | "systemCommand"
  | "webSearch"
  | "clipboard"
  | "ocr";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "全般" },
  { id: "fileSearch", label: "ファイル検索" },
  { id: "convert", label: "計算・変換" },
  { id: "systemCommand", label: "システムコマンド" },
  { id: "webSearch", label: "Web検索" },
  { id: "clipboard", label: "クリップボード" },
  { id: "ocr", label: "OCR" },
];

export function SettingsPanel({
  appSettings,
  hotkeyError,
  onSaveHotkey,
  onSetFileSearchEnabled,
  onSetCalcEnabled,
  onSetCopyWithComma,
  onSetUrlConvertEnabled,
  onSetUrlConvertKeepSpaceEncoded,
  onSetSystemCommandEnabled,
  onSetWebSearchEnabled,
  onSetClipboardEnabled,
  onSetClipboardPrefix,
  onSetClipboardMaxItems,
  clipboardSettingsError,
  onSetOcrEnabled,
  onSetCheckUpdateOnStartup,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
  onOpenFolder,
  onClose,
}: {
  appSettings: AppSettings;
  hotkeyError: string | null;
  onSaveHotkey: (accelerator: string) => void;
  onSetFileSearchEnabled: (checked: boolean) => void;
  onSetCalcEnabled: (checked: boolean) => void;
  onSetCopyWithComma: (checked: boolean) => void;
  onSetUrlConvertEnabled: (checked: boolean) => void;
  onSetUrlConvertKeepSpaceEncoded: (checked: boolean) => void;
  onSetSystemCommandEnabled: (checked: boolean) => void;
  onSetWebSearchEnabled: (checked: boolean) => void;
  onSetClipboardEnabled: (checked: boolean) => void;
  onSetClipboardPrefix: (prefix: string) => void;
  onSetClipboardMaxItems: (maxItems: number) => void;
  clipboardSettingsError: string | null;
  onSetOcrEnabled: (checked: boolean) => void;
  onSetCheckUpdateOnStartup: (checked: boolean) => void;
  folders: FolderEntry[];
  onAddFolder: () => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then((v) => setVersion(v));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
      <div
        data-tauri-drag-region="deep"
        className="flex items-center px-4 py-3 border-b border-gray-200/60"
      >
        <button
          type="button"
          onClick={onClose}
          className="p-1 mr-2 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
          title="戻る"
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
        <span className="text-base font-medium text-gray-800">設定</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-32 flex-shrink-0 border-r border-gray-200/60 py-2 overflow-y-auto">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2 text-sm ${
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
              error={hotkeyError}
              onSave={onSaveHotkey}
              checkUpdateOnStartup={appSettings.checkUpdateOnStartup}
              onToggleCheckUpdateOnStartup={onSetCheckUpdateOnStartup}
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
              error={clipboardSettingsError}
            />
          )}
          {tab === "ocr" && (
            <OcrSettings
              enabled={appSettings.ocrEnabled}
              onToggle={onSetOcrEnabled}
            />
          )}
        </div>
      </div>

      {version && (
        <div className="px-4 py-2 border-t border-gray-200/60 text-right">
          <span className="text-xs text-gray-400">v{version}</span>
        </div>
      )}
    </div>
  );
}
