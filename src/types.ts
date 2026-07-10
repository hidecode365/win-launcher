export interface FileEntry {
  name: string;
  path: string;
  icon: string | null;
}

export interface FrecencyEntry {
  count: number;
  lastUsed: number;
}

export type FrecencyMap = Record<string, FrecencyEntry>;

export interface FolderEntry {
  path: string;
  enabled: boolean;
}

export interface AppSettings {
  hotkey: string;
  fileSearchEnabled: boolean;
  calcEnabled: boolean;
  systemCommandEnabled: boolean;
  webSearchEnabled: boolean;
  copyWithComma: boolean;
  clipboardEnabled: boolean;
  clipboardPrefix: string;
  clipboardMaxItems: number;
  ocrEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hotkey: "Alt+Space",
  fileSearchEnabled: true,
  calcEnabled: true,
  systemCommandEnabled: true,
  webSearchEnabled: true,
  copyWithComma: true,
  clipboardEnabled: true,
  clipboardPrefix: "cb",
  clipboardMaxItems: 50,
  ocrEnabled: true,
};

export interface SystemCommand {
  action: "shutdown" | "restart" | "sleep";
  label: string;
  keywords: string[];
}

export interface ClipboardTextEntry {
  type: "text";
  id: string;
  text: string;
  timestamp: number;
}

export interface ClipboardImageEntry {
  type: "image";
  id: string;
  thumbnailDataUrl: string;
  width: number;
  height: number;
  timestamp: number;
}

export type ClipboardEntry = ClipboardTextEntry | ClipboardImageEntry;

// Rust 側からの "clipboard-changed" イベントの payload。画像はバイナリを一切含まず、
// Rust 側キャッシュの ID とサムネイル dataURL のみを運ぶ（大きな画像データが IPC を
// 通過して JS 側の処理が重くなるのを避けるため）。テキストは軽量なため、ここでは
// 種別のみを通知し、実際の取得は readText() でフロントエンドが行う。
export type ClipboardChangedPayload =
  | { type: "text" }
  | {
      type: "image";
      id: string;
      thumbnailDataUrl: string;
      width: number;
      height: number;
      timestamp: number;
    };
