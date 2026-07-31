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
// ブラックリスト用・ホワイトリスト用の拡張子リストは、モード切替時に互いの
// 入力内容を消さないよう独立したフィールドとして保持する（詳細は CLAUDE.md
// 「検索フォルダごとの詳細設定」節を参照）。
export interface FolderDetailSettings {
  maxDepth: number;
  includeFolders: boolean;
  extensionFilterMode: ExtensionFilterMode;
  blacklistExtensions: string[];
  whitelistExtensions: string[];
}

export interface FolderEntry extends FolderDetailSettings {
  path: string;
  enabled: boolean;
}

// ピン止め・お気に入り・メモの3機能を単一のツリー構造で管理する共通ノード。
// `children` を持つ入れ子構造ではなく `parentId` を持つフラットな配列（隣接リスト方式）
// として扱う（詳細は REQUIREMENTS.md「ピン止め・お気に入り・メモ機能」節、
// CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。`clipboard`・`command` は
// 型定義のみで今回は生成・使用しない。
export type FavoriteNodeType = "folder" | "file" | "clipboard" | "command";

export interface FavoriteNode {
  id: string;
  parentId: string;
  type: FavoriteNodeType;
  name: string;
  value: string;
  order: number;
}

// ルート直下に生成される3つの予約フォルダの固定ID。Rust側 main.rs の
// PINNED_FOLDER_ID 等の定数と値を一致させること（値そのものを変更する場合は
// 両方を同時に更新する）。
export const PINNED_FOLDER_ID = "__pinned__";
export const FAVORITES_FOLDER_ID = "__favorites__";

// 登録ダイアログ（RegisterEntryDialog）の「保存先フォルダ」プルダウン1件分。
// お気に入り・メモ（いずれも予約フォルダ配下に folder 型ノードで階層整理できる）で
// 共通の形として使う。`label` は呼び出し側がツリー階層をフラット化する際にインデント・
// 区切り記号を含めた表示用文字列を組み立てて渡す（詳細は useSearch.ts
// `favoriteFolderOptions` を参照）。
export interface RegisterFolderOption {
  id: string;
  label: string;
}

// RegisterEntryDialog の「新規フォルダ作成」の結果。`folder` が非nullなら成功
// （作成されたフォルダの id/label。即座に保存先として選択するために使う）、
// `error` が非nullなら失敗時のエラーメッセージ（表示名の空チェックと同じ形式で
// 表示する。フォルダ名の重複等、Rust側のバリデーションメッセージをそのまま渡す）。
export interface CreateFolderResult {
  folder: RegisterFolderOption | null;
  error: string | null;
}

// /recent の「表示対象設定」の入力値。保存ボタン押下時に `set_recent_display_settings`
// へまとめて渡す。`FolderDetailSettings` から `maxDepth`（/recent には検索階層の概念が
// ない）を除いた形で、フォルダ単位ではなく /recent 機能全体で共有する単一の設定として
// 扱う（詳細は CLAUDE.md 「/recent の表示対象設定」節を参照）。
export interface RecentDisplaySettings {
  includeFolders: boolean;
  extensionFilterMode: ExtensionFilterMode;
  blacklistExtensions: string[];
  whitelistExtensions: string[];
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
  // /recent の「表示対象設定」。フォルダごとの `FolderEntry` とは異なり、/recent 機能
  // 全体で共有する単一のグローバル設定（詳細は CLAUDE.md 「/recent の表示対象設定」節を
  // 参照）。ブラックリスト用・ホワイトリスト用の拡張子リストは独立管理とする（詳細は
  // `FolderDetailSettings` を参照）。
  recentIncludeFolders: boolean;
  recentExtensionFilterMode: ExtensionFilterMode;
  recentBlacklistExtensions: string[];
  recentWhitelistExtensions: string[];
  pathPasteEnabled: boolean;
  pinEnabled: boolean;
  favoriteEnabled: boolean;
  favoriteKeyword: string;
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
  recentIncludeFolders: false,
  recentExtensionFilterMode: "blacklist",
  recentBlacklistExtensions: [],
  recentWhitelistExtensions: [],
  pathPasteEnabled: true,
  pinEnabled: true,
  favoriteEnabled: true,
  favoriteKeyword: "favorite",
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

export type PrefixCommandKind = "system" | "clipboard" | "recent" | "favorite";

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

// R-1: 通常モード（clipboardMode／pathPasteWizardMode を除く。詳細は CLAUDE.md
// 「結果行のフラット配列化（R-1）」節を参照）の結果一覧を、1つのフラット配列として
// 表現する判別可能 Union。行の並び順の正本は `src/hooks/useSearch.ts` の `rows` で
// あり、pinnedLength/pathPasteLength/calcLength/urlConvertLength によるオフセット
// 計算（App.tsx・ResultList.tsx・選択復元用 useEffect の3箇所に分散していたもの）は
// 段階的にこの rows へ統合していく。
//
// `key` は React の key に使う安定した識別子（行番号は使わない。ファイルパス等が
// 由来のため、種別ごとに接頭辞を付けて他種別のキーと衝突しないようにしている）。
// Web検索行（webSearchVisible）はこの Union には含めない（複数モードにまたがって
// 末尾に追加される特殊な行のため、フェーズEで別途扱う）。
export type ResultRow =
  | { kind: "pinned"; key: string; file: FileEntry; exists: boolean; favorited: boolean }
  | { kind: "pathPasteShortcut"; key: string; candidate: PastedPathInfo }
  | { kind: "pathPasteAddFolder"; key: string; candidate: PastedPathInfo }
  | { kind: "calc"; key: string; result: string }
  | { kind: "urlConvert"; key: string; result: UrlConvertResult }
  | { kind: "file"; key: string; file: FileEntry; pinned: boolean; favorited: boolean };

// `/favorite` モードの一覧の1行分。フォルダ見出し行（folder）とアイテム行（item）の
// 判別可能 Union（詳細は REQUIREMENTS.md「お気に入り機能」節「/favorite モード」・
// useSearch.ts の `favoriteTree` を参照）。
//
// `key` は他の行種別と同様、React key・選択の識別子（intent の key）の両方に使う
// 安定した文字列（`favoriteFolder:<id>`/`favoriteItem:<id>`。FavoriteNode.id は
// 一意なため、行番号ではなくこれを識別子にする）。
// `depth` はインデント段数（ルート「お気に入り」直下の項目は 0）。
// ↑↓キーによる選択移動・`data-index` によるスクロール追従は、フォルダ見出し行・
// アイテム行の両方を対象に、この配列（`useSearch.ts` の `favoriteTree`）上の
// 位置そのものをインデックスとして使う（軸1でアイテム行専用の `itemIndex` 方式から
// フォルダ見出し行も含む方式へ拡張。詳細は REQUIREMENTS.md「/favorite モード」節を参照）。
// `isFirstSibling`/`isLastSibling` は、段階3のドラッグ&ドロップ実装までの暫定的な
// 「上へ移動」「下へ移動」操作のための判定。同じ parentId を共有する兄弟ノード
// （order 昇順。横断検索によるフィルタ表示の影響を受けない、実際の全兄弟基準）の
// 先頭・末尾かどうかを表す（先頭なら「上へ移動」、末尾なら「下へ移動」を無効化する）。
// `directChildCount`（folder のみ）は、そのフォルダの直接の子ノード数（孫は含めない。
// 折りたたみ状態・横断検索によるフィルタ表示には依存しない、常に実際の全直下件数）。
// 件数バッジの表示に使う。
export type FavoriteTreeRow =
  | {
      kind: "folder";
      key: string;
      node: FavoriteNode;
      depth: number;
      collapsed: boolean;
      isFirstSibling: boolean;
      isLastSibling: boolean;
      directChildCount: number;
    }
  | {
      kind: "item";
      key: string;
      node: FavoriteNode;
      depth: number;
      file: FileEntry;
      exists: boolean;
      isFirstSibling: boolean;
      isLastSibling: boolean;
    };

// FavoriteTreeRow["key"] の組み立て。フォーマット（`favoriteFolder:<id>`/
// `favoriteItem:<id>`）を1箇所にまとめ、useSearch.ts の favoriteTree 構築処理・
// App.tsx（お気に入り編集ビューでのフォルダ作成後の選択移動等）の両方から
// 参照する（同じフォーマット文字列をハードコードで2箇所に書かない）。
export function favoriteFolderRowKey(id: string): string {
  return `favoriteFolder:${id}`;
}
export function favoriteItemRowKey(id: string): string {
  return `favoriteItem:${id}`;
}
