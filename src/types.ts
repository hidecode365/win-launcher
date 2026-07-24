export interface FileEntry {
  name: string;
  path: string;
  icon: string | null;
}

// Rust の `get_recent_files` コマンドの戻り値。path は .lnk 由来ならリンク先の
// ローカルパス、.url 由来なら OneDrive のローカル同期先パスへの変換に成功した
// ローカルパス（変換に失敗したものは一覧に含まれないため、常に実在確認済みの
// ローカルパスになる）。lastAccessed は .lnk/.url ショートカット自体の更新日時
// （UNIX ms）で、リンク先実ファイルのタイムスタンプではない。
export interface RecentFile {
  name: string;
  path: string;
  lastAccessed: number;
}

export interface FrecencyEntry {
  count: number;
  lastUsed: number;
}

export type FrecencyMap = Record<string, FrecencyEntry>;

// 拡張子フィルタリングのモード。ホワイトリスト/ブラックリストは排他選択で、
// 「*」等の全許可を意味する特殊タグは用意しない（詳細は REQUIREMENTS.md
// 「検索フォルダの詳細設定ダイアログ」節を参照）。
export type ExtensionFilterMode = "blacklist" | "whitelist";

export const DEFAULT_FOLDER_MAX_DEPTH = 3;

// フォルダごとの詳細設定（検索階層数・フォルダ自体の検索対象可否・拡張子
// フィルタリング）の入力値。保存ボタン押下時に `set_folder_settings` へまとめて渡す。
export interface FolderDetailSettings {
  maxDepth: number;
  includeFolders: boolean;
  extensionFilterMode: ExtensionFilterMode;
  extensions: string[];
}

export interface FolderEntry extends FolderDetailSettings {
  path: string;
  enabled: boolean;
}

export interface AppSettings {
  hotkey: string;
  fileSearchEnabled: boolean;
  calcEnabled: boolean;
  systemCommandEnabled: boolean;
  shutdownKeyword: string;
  restartKeyword: string;
  sleepKeyword: string;
  webSearchEnabled: boolean;
  copyWithComma: boolean;
  clipboardEnabled: boolean;
  clipboardPrefix: string;
  clipboardMaxItems: number;
  ocrEnabled: boolean;
  checkUpdateOnStartup: boolean;
  urlConvertEnabled: boolean;
  urlConvertKeepSpaceEncoded: boolean;
  recentFilesEnabled: boolean;
  recentKeyword: string;
  recentMaxAgeDays: number;
  recentMaxResults: number;
  pathPasteEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hotkey: "Alt+Space",
  fileSearchEnabled: true,
  calcEnabled: true,
  systemCommandEnabled: true,
  shutdownKeyword: "shutdown",
  restartKeyword: "restart",
  sleepKeyword: "sleep",
  webSearchEnabled: true,
  copyWithComma: true,
  clipboardEnabled: true,
  clipboardPrefix: "cb",
  clipboardMaxItems: 50,
  ocrEnabled: true,
  checkUpdateOnStartup: true,
  urlConvertEnabled: true,
  urlConvertKeepSpaceEncoded: false,
  recentFilesEnabled: true,
  recentKeyword: "recent",
  recentMaxAgeDays: 180,
  recentMaxResults: 50,
  pathPasteEnabled: true,
};

// Rust の `check_for_update` コマンドの戻り値。
export interface UpdateCheckResult {
  available: boolean;
  version: string | null;
  notes: string | null;
}

// URLエンコード/デコードの自動表示結果。kind でどちらの処理結果かを識別し、
// 検索結果アイテムのラベル表示（「デコード結果」/「エンコード結果」）に使う。
export interface UrlConvertResult {
  text: string;
  kind: "decode" | "encode";
}

export type SystemCommandAction = "shutdown" | "restart" | "sleep";

export interface SystemCommand {
  action: SystemCommandAction;
  label: string;
}

// システムコマンド3キーワードそれぞれの保存エラー（重複・空文字列等）。
// フィールドごとに独立して表示するため、単一の文字列ではなくコマンドごとに保持する。
export type SystemCommandKeywordErrors = Record<SystemCommandAction, string | null>;

export type PrefixCommandKind = "system" | "clipboard" | "recent";

// 「/」候補一覧（プレフィックスコマンド候補表示）の1件分。
// keyword は「/」+ キーワード全体（例: "/shutdown"）。選択・実行時の分岐と
// frecency 永続化のキーの両方に使う。kind が "system" の場合のみ action を持つ。
export interface PrefixCommand {
  keyword: string;
  description: string;
  kind: PrefixCommandKind;
  action: SystemCommandAction | null;
}

// Rust の `detect_pasted_path` コマンドの戻り値。パス貼り付けによる検索フォルダ管理の
// 貼り付け判定結果。実在確認・フォルダ/ファイル判定済みの単一パスのみを表す
// （CF_HDROP に複数パスが含まれる場合や実在しないパスは Rust 側で null になる）。
export interface PastedPathInfo {
  path: string;
  name: string;
  isDir: boolean;
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
