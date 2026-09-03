import {
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-shell";
import type { Store } from "@tauri-apps/plugin-store";
import { hideWindow } from "../lib/window";
import { logUiEvent } from "../lib/uiDebugLog";
import { formatWithCommas, makeId } from "../lib/format";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import {
  resolveSelected,
  SelectableItem,
  SelectIntent,
  SELECT_INTENT_TIMEOUT_MS,
} from "../lib/selectIntent";
import {
  AppSettings,
  CreateFolderResult,
  FavoriteNode,
  favoriteFolderRowKey,
  favoriteItemRowKey,
  FavoriteTreeRow,
  FAVORITES_FOLDER_ID,
  FileEntry,
  FolderEntry,
  FrecencyMap,
  PastedPathInfo,
  PINNED_FOLDER_ID,
  PrefixCommand,
  RecentFile,
  RegisterFolderOption,
  ResultRow,
  SystemCommand,
  UrlConvertResult,
} from "../types";

export type PathPasteWizardStep = "idle" | "folderSelect" | "nameEdit";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

// キーボード（↑↓）で選択操作をした直後、この時間内に発生した onMouseEnter による
// 選択変更は無視する。オートスクロールでカーソル直下の行が入れ替わっただけの
// 非ユーザー起因の mouseenter が、キーボード操作の結果を横から上書きするのを防ぐため。
const HOVER_SUPPRESS_AFTER_KEYBOARD_MS = 200;

function decayFactor(lastUsed: number, now: number): number {
  const elapsed = now - lastUsed;
  if (elapsed <= HOUR_MS) return 1.0;
  if (elapsed <= DAY_MS) return 0.9;
  if (elapsed <= WEEK_MS) return 0.7;
  if (elapsed <= MONTH_MS) return 0.5;
  return 0.3;
}

function frecencyScore(
  entry: FrecencyMap[string] | undefined,
  now: number
): number {
  if (!entry) return 0;
  return entry.count * decayFactor(entry.lastUsed, now);
}

function sortByFrecency(files: FileEntry[], frecency: FrecencyMap): FileEntry[] {
  const now = Date.now();
  return [...files].sort((a, b) => {
    const scoreDiff = frecencyScore(frecency[b.path], now) - frecencyScore(frecency[a.path], now);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });
}

// クエリ全体が数字・演算子・括弧・空白・小数点のみで構成される場合のみ計算式とみなす。
// 単に `/` や数字が含まれるだけで計算式と誤判定しないよう（例: URL の「https://」や
// パーセントエンコード文字列に含まれる数字・`/`）、文字種を丸ごと制限したうえで
// 数字・演算子の両方を含むことを確認する。
function isCalcExpression(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (!/^[\d+\-*/.()\s]+$/.test(trimmed)) return false;
  return /\d/.test(trimmed) && /[+\-*/]/.test(trimmed);
}

// keepSpaceEncoded が true の場合、リテラル "%20" の箇所だけをデコード対象から
// 除外する。%20 は3文字固定のトークンで他の %XX エスケープと重なり得ないため、
// 文字列として split → 各断片を個別に decodeURIComponent → "%20" で join するだけで、
// 前後の他のエスケープシーケンスを壊さずに「%20 だけ残す」を実現できる。
function decodeUrl(q: string, keepSpaceEncoded: boolean): string {
  if (!keepSpaceEncoded) return decodeURIComponent(q);
  return q
    .split(/%20/gi)
    .map((part) => decodeURIComponent(part))
    .join("%20");
}

// 入力（前後空白除去後）が `http://` または `https://` で始まる場合のみ true。
// これを満たさない入力は、%XX パターンや非ASCII文字を含んでいてもエンコード/デコード
// 結果を一切表示しない（通常の日本語検索がエンコード結果扱いされ、本来優先すべき
// ファイル検索結果等を押し下げてしまうノイズを防ぐため）。
function isUrlLikeInput(q: string): boolean {
  const trimmed = q.trim();
  return /^https?:\/\//i.test(trimmed);
}

// `parentId` から祖先を辿り、`ancestorId` に到達するかどうかを判定する。お気に入りは
// 「お気に入り」予約フォルダ配下にツリー構造（folder型ノードを挟んだ入れ子）で整理
// できる点がピン止め（フラット構造、`parentId === PINNED_FOLDER_ID` の1回比較で
// 判定できる）と異なるため、祖先を再帰的に辿る必要がある。Rust側 `is_descendant_of`
// （main.rs）と同じロジック・同じ探索深さの上限（循環参照は現状発生し得ないが
// 防御的に設けている）。FavoriteEditTree.tsx がドラッグ中の循環参照事前チェック
// （4e追加分）でも同じロジックを再利用するため export する。
export function isDescendantOfFolder(
  nodes: FavoriteNode[],
  parentId: string,
  ancestorId: string
): boolean {
  let current = parentId;
  for (let i = 0; i < 64; i++) {
    if (current === ancestorId) return true;
    const parent = nodes.find((n) => n.id === current);
    if (!parent) return false;
    current = parent.parentId;
  }
  return false;
}

// 「お気に入り」ツリー配下のノードのみを抽出する。Rust 側 `get_favorite_nodes`
// と同じフィルタ（`is_descendant_of(favorites, parent_id, FAVORITES_FOLDER_ID)`）を
// フロントエンドでも再現したもの（ソートは呼び出し側の groupNodesByParent が
// 改めて order 昇順に並べ替えるため、ここでは行わなくてよい）。
//
// フォルダ作成・リネーム・削除・移動・開閉状態変更・★解除は、いずれも Rust
// コマンドが更新後の `favorites` 全量（`saved`）をレスポンスとして返す。以前は
// これとは別に `fetchFavoriteNodes`（`get_favorite_nodes` への追加の非同期
// 往復）を呼んで `rawFavoriteNodes`（favoriteTree の実データ源）を更新していたが、
// この追加の往復が解決するまでの間 `favoriteTree` は古いままになる。連続して
// 素早く操作すると（例：フォルダ作成直後に、作成した行を選択してすぐ次のフォルダを
// 作成する）、`favoriteTree` にまだ新しい行が反映されていない状態で選択解決
// （resolveSelected）が行われ、直前の選択（古い行）にフォールバックしたまま
// 次の操作の対象になってしまう不具合があった（詳細は
// docs/internal-design/favorites-data-model.md「経緯」節を参照）。`saved` から同期的に
// 導出すればこの非同期の隙間自体が生じない。
//
// 新規のファイルパスを登録する操作（`confirmFavoriteDialog`。実体の有無を
// `check_paths_exist` で確認する必要がある）はこの対象外とし、従来通り
// `fetchFavoriteNodes` を使う。
function deriveFavoriteNodesFromFavorites(saved: FavoriteNode[]): FavoriteNode[] {
  return saved.filter((f) =>
    isDescendantOfFolder(saved, f.parentId, FAVORITES_FOLDER_ID)
  );
}

// クエリに応じて URL デコード/エンコードの自動変換結果を返す（該当しない場合は null）。
// 0. 入力が http(s):// で始まらない場合は、以降の判定を行わず null を返す
// 1. `%XX`（16進数2桁）パターンを含む場合はデコードを試みる。
//    無変化判定（結果を表示するかどうか）は、スペース保持設定を無視した完全デコード
//    （decodeURIComponent(q) そのもの）と入力の比較で行う。こうすることで、
//    `%20` 以外に実際にデコードされる要素がない入力かどうかを正しく判定できる
//    （decodeURIComponent は不正なエスケープシーケンスに対して URIError を投げるため、
//    その場合は null とする）。
//    完全デコード結果が入力と異なる場合（＝ %20 を含め何かしら実際にデコードされる
//    要素がある場合）は有効なデコード対象とみなし、表示用の文字列自体は
//    keepSpaceEncoded を反映したもの（`%20` のみデコードせずそのまま残す。
//    スペースをURLの終端と誤認識するアプリ対策）を返す。この場合、表示文字列が
//    入力と見た目上一致することもあるが、それは正しい挙動である
//    （呼び出し側が kind: "decode" のラベルで区別する）
// 2. 上記に該当せず非ASCII文字を含む場合はエンコード結果を返す
//    （encodeURIComponent ではなく encodeURI を使う。`: / ? # [ ] @ ! $ & ' ( ) * + , ; =`
//    などの URL 構造を保つ記号はエンコードせず、非ASCII文字のみをパーセントエンコードするため）
// 3. どちらにも該当しない場合は null（追加の検索結果を表示しない）
function detectUrlConvertResult(
  q: string,
  keepSpaceEncoded: boolean
): UrlConvertResult | null {
  if (!q) return null;
  if (!isUrlLikeInput(q)) return null;
  if (/%[0-9A-Fa-f]{2}/.test(q)) {
    try {
      const fullyDecoded = decodeURIComponent(q);
      if (fullyDecoded === q) return null;
      return { text: decodeUrl(q, keepSpaceEncoded), kind: "decode" };
    } catch {
      return null;
    }
  }
  if (/[^\x00-\x7F]/.test(q)) {
    return { text: encodeURI(q), kind: "encode" };
  }
  return null;
}

// 明示プレフィックスの固定区切り文字。ユーザーは変更できない
// （変更可能なのは "/" に続くキーワード部分のみ）。
// closeWindow の clearQuery: "prefixOnly" でプレフィックス文字列を組み立てる際にも
// 再利用するため、他フック（useClipboard 等）からも参照できるよう export する。
export const PREFIX_CHAR = "/";

const SYSTEM_COMMANDS: SystemCommand[] = [
  { action: "shutdown", label: "シャットダウン" },
  { action: "restart", label: "再起動" },
  { action: "sleep", label: "スリープ" },
];

function systemCommandKeyword(
  action: SystemCommand["action"],
  appSettings: AppSettings
): string {
  switch (action) {
    case "shutdown":
      return appSettings.shutdownKeyword;
    case "restart":
      return appSettings.restartKeyword;
    case "sleep":
      return appSettings.sleepKeyword;
  }
}

// システムコマンドはコマンドごとに独立したキーワードを持つため、クリップボード履歴の
// ような「共通プレフィックス＋残り文字列の抽出」ではなく、コマンドごとに "/" + キーワード
// 全体を対象にクエリとの前方一致を判定する（クエリがその文字列の先頭部分であれば候補になる。
// 例: キーワードが既定の "restart" のままなら "/re" が "/restart" に前方一致する）。
function matchSystemCommands(
  query: string,
  appSettings: AppSettings
): SystemCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SYSTEM_COMMANDS.filter((cmd) => {
    const full = (
      PREFIX_CHAR + systemCommandKeyword(cmd.action, appSettings)
    ).toLowerCase();
    return full.startsWith(q);
  });
}

// クエリが "/" + 呼び出しキーワードに前方一致するかどうかだけを判定する。
// issue 0024（クリップボード履歴・最近使ったファイルのL1画面化）以降、続く文字列
// （かつてはここから抽出してフィルタ文字列として使っていた）は入力時点で破棄し、
// 画面上部の独立したローカル絞り込みstate（clipboardEditFilterText/
// recentEditFilterText）を使うため、この関数はモードの発火判定（真偽値）のみを返す。
function hasPrefixMatch(query: string, keyword: string): boolean {
  const full = PREFIX_CHAR + keyword;
  return query.toLowerCase().startsWith(full.toLowerCase());
}

// 判定方式は hasPrefixMatch と同じ（"/" + appSettings.favoriteKeyword への
// 前方一致）。favoriteModeFilter は issue 0024の対象外（お気に入り画面は既存の
// 挙動を変更しない）のため、続く文字列を /favorite モードのフォルダ横断検索の
// フィルタ文字列として返す従来の実装のまま維持する。
function favoriteModeFilter(query: string, favoriteKeyword: string): string | null {
  const full = PREFIX_CHAR + favoriteKeyword;
  if (!query.toLowerCase().startsWith(full.toLowerCase())) return null;
  return query.slice(full.length).trim();
}

const PREFIX_COMMAND_FRECENCY_KEY = "prefixCommandFrecency";

// クエリが "/" から始まる場合、登録済みの全プレフィックスコマンド（システムコマンド3つ＋
// クリップボード履歴。それぞれのキーワード判定ロジック自体は matchSystemCommands /
// hasPrefixMatch と変えず、ここでは「候補として並べて表示する」ための一覧を
// 組み立てるだけ）のうち、クエリに前方一致するものを返す。
// 例: クエリが "/" 単体なら全件、"/sh" なら "/shutdown" のみに絞り込まれる。
function buildPrefixCommandCandidates(
  query: string,
  appSettings: AppSettings
): PrefixCommand[] {
  const q = query.trim().toLowerCase();
  if (!q.startsWith(PREFIX_CHAR)) return [];

  const candidates: PrefixCommand[] = [];

  if (appSettings.systemCommandEnabled) {
    for (const cmd of matchSystemCommands(query, appSettings)) {
      candidates.push({
        keyword: PREFIX_CHAR + systemCommandKeyword(cmd.action, appSettings),
        description: cmd.label,
        kind: "system",
        action: cmd.action,
      });
    }
  }

  if (appSettings.clipboardEnabled) {
    const full = PREFIX_CHAR + appSettings.clipboardPrefix;
    if (full.toLowerCase().startsWith(q)) {
      candidates.push({
        keyword: full,
        description: "クリップボード履歴",
        kind: "clipboard",
        action: null,
      });
    }
  }

  if (appSettings.recentFilesEnabled) {
    const full = PREFIX_CHAR + appSettings.recentKeyword;
    if (full.toLowerCase().startsWith(q)) {
      candidates.push({
        keyword: full,
        description: "最近使ったファイル",
        kind: "recent",
        action: null,
      });
    }
  }

  if (appSettings.favoriteEnabled) {
    const full = PREFIX_CHAR + appSettings.favoriteKeyword;
    if (full.toLowerCase().startsWith(q)) {
      candidates.push({
        keyword: full,
        description: "お気に入り",
        kind: "favorite",
        action: null,
      });
    }
  }
  if (appSettings.memoEnabled) {
    const full = PREFIX_CHAR + appSettings.memoKeyword;
    if (full.toLowerCase().startsWith(q)) {
      candidates.push({ keyword: full, description: "メモ", kind: "memo", action: null });
    }
  }

  return candidates;
}

// ファイル検索結果の frecency（sortByFrecency）と同じスコア計算・decay を、
// プレフィックスコマンド候補にも適用する。キーは呼び出し文字列（"/shutdown" 等）。
function sortPrefixCommandsByFrecency(
  candidates: PrefixCommand[],
  frecency: FrecencyMap
): PrefixCommand[] {
  const now = Date.now();
  return [...candidates].sort((a, b) => {
    const scoreDiff =
      frecencyScore(frecency[b.keyword], now) -
      frecencyScore(frecency[a.keyword], now);
    if (scoreDiff !== 0) return scoreDiff;
    return a.keyword.localeCompare(b.keyword);
  });
}

// R-1 フェーズD-2: 選択（selected）は書き込み可能な state ではなく、「ユーザーが
// 選びたい」という意図（intent）と、現在の行一覧から毎回導出する値にする。
//
// 【フェーズDのリグレッションと根本原因】フェーズDでは pendingSelectKeyRef（識別子
// を保持する ref）と suppressNextSelectResetRef を廃止し、識別子ベースの復元
// （rows.findIndex）に統一したが、実機で次のリグレッションが発生した：ピン止め
// 追加・D&D並び替え直後、一瞬正しい行が選択された直後に先頭行へ戻ってしまう。
// 原因は、選択の復元が成功した時点で pendingSelectKeyRef が null に戻り、その後
// 遅れて到着する search_files 解決時のリセット処理（`pendingSelectKeyRef.current
// === null` を条件に selected を 0 にする）を、もはや抑止できなくなったこと。
// 根本原因は、selected が「複数の非同期処理がそれぞれ書き込める state」で
// あったこと。ピン止め操作・D&D・検索結果の解決が、それぞれ独立に selected へ
// 書き込む経路を持つ限り、一発の抑止フラグで特定の書き込みだけを抑止しても、
// 書き込みの経路自体は残り続け、別のタイミング・別の非同期処理の組み合わせで
// 同種の競合が再発する。
//
// 【この設計での解決】selected への書き込み経路を「導出結果を反映する1箇所」
// だけに絞る。すべての操作（クエリ変更・↑↓・ホバー・ピン止め追加/解除・D&D）は
// intent を更新するだけにとどめ、selected 自体は intent と現在の行一覧から
// resolveSelected で毎回計算する。書き込み経路が構造的に1本になるため、
// 「複数の非同期処理が競合する」という根本原因自体が成立しなくなる。
//
// 【適用範囲】この intent ベースの導出は「通常モード（rows）」と「clipboardMode
// （clipboardSelectionItems）」にのみ適用する。理由：clipboardMode は既に
// クリップボード変更のプッシュ型リスナー（非同期の外部更新）を持ち、今後
// お気に入り／メモ機能でノート登録という非同期IPC書き込みが加わる予定があり、
// 今回のリグレッションと同型の「非同期書き込み × 非同期外部更新」という構造を
// 抱えることになるため、先んじて intent 化しておく。prefixCommandMode／
// pathPasteWizardMode／Web検索行の+1特例には、こうした非同期書き込みを追加する
// 具体的な予定が無いため、現状の生インデックス書き込み（setSelected／
// selectFromHover）のまま維持する（詳細は CLAUDE.md「選択状態の維持」節を参照）。
//
// SelectIntent 型・resolveSelected・SELECT_INTENT_TIMEOUT_MS は
// src/lib/selectIntent.ts に切り出し済み（お気に入り編集ビューの
// useFavoriteEditSelection.ts が、/favorite ブラウジングとは独立した選択
// ドメインとして同じ方式を再利用するため）。

export function useSearch(
  appSettings: AppSettings,
  settingsVersion: number,
  storeRef: MutableRefObject<Store | null>,
  // issue 0024：クリップボード履歴・最近使ったファイルの確定クローズ（Enterでの
  // コピー／ファイル起動）で、L1画面（App.tsx の view state）を明示的に検索画面へ
  // 戻すためのコールバック。view は App.tsx側の state のため、useSearch.ts 自身は
  // 直接変更できず、呼び出し元から受け取る（お気に入り・メモの確定クローズは
  // 従来通り view を変更しない。詳細は launchFile のコメントを参照）。
  resetToSearchView: () => void
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  const [selected, setSelectedRaw] = useState(0);
  const [calcResult, setCalcResult] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<SystemCommand | null>(
    null
  );
  const [frecency, setFrecency] = useState<FrecencyMap>({});
  const frecencyRef = useRef<FrecencyMap>({});
  const [prefixCommandFrecency, setPrefixCommandFrecency] =
    useState<FrecencyMap>({});
  const prefixCommandFrecencyRef = useRef<FrecencyMap>({});

  // パス貼り付けによる検索フォルダ管理。判定結果（候補行表示）はファイル検索結果と
  // 共存するが、機能2のミニウィザード（フォルダ選択→名前編集）進行中は他の暗黙判定・
  // ファイル検索と排他になる（詳細は 00-requirements.md「パス貼り付けによる検索フォルダ管理」節）。
  const [pathPasteCandidate, setPathPasteCandidate] =
    useState<PastedPathInfo | null>(null);
  const [wizardStep, setWizardStep] = useState<PathPasteWizardStep>("idle");
  const [wizardFolders, setWizardFolders] = useState<FolderEntry[]>([]);
  const [wizardSelectedFolder, setWizardSelectedFolder] =
    useState<FolderEntry | null>(null);
  const [wizardName, setWizardName] = useState("");

  // ウィンドウを閉じる系のアクション（launchFile 等）は setQuery("") でクエリを空に
  // 戻すが、その時点で既にクエリが空（無入力のまま frecency 順のデフォルト一覧から
  // 直接ファイルを起動した場合など）だと "" → "" は値として変化しないため、React の
  // useState は再レンダリングそのものをスキップする（Object.is 比較によるベイルアウト）。
  // その結果、query を依存配列に持つメインの検索エフェクトが再実行されず、直前に
  // setResults([]) で空にした結果一覧が、次に実際にクエリを変更するまで空のまま
  // 固まって見える不具合になる（「通常のファイル検索結果で Shift+Enter 後、
  // フォーカス復帰しても一覧が空白のまま」の実際の原因）。query 自身の値の変化に
  // 依存せず確実にエフェクトを再実行させるため、専用のカウンタを設けて依存配列に含める。
  const [closeRefreshTick, setCloseRefreshTick] = useState(0);
  const bumpCloseRefreshTick = useCallback(() => {
    setCloseRefreshTick((t) => t + 1);
  }, []);

  // ウィンドウを閉じる系のアクション（launchFile/openContainingFolder/copyResult/
  // copyUrlConvertResult/openWebSearch/confirmSystemCommand/selectClipboardEntry/
  // addSearchFolderFromPaste/confirmShortcut）が共通して経由する関数。設計原則・
  // 過去の経緯の詳細は「ウィンドウを閉じる系アクションの共通設計」節を参照。要点のみ記す：
  //
  // 1. hideWindow() を何よりも先に await する。呼び出し元がファイル起動等の Rust
  //    コマンドを呼んでいても、それは closeWindow() を呼ぶ前に fire-and-forget で
  //    発火済みのものとし、closeWindow() 自体はそれを待たない。
  // 2. hideWindow() が解決した後（＝ウィンドウが実際に非表示になったことが確定した後）
  //    にのみ、クエリのクリア・closeRefreshTick の加算・呼び出し元固有の後処理
  //    （cleanup オプション）を行う。ここより前の時点で results 等の React state を
  //    変更するコードを追加しないこと（隠れる前の中間状態がユーザーに見えてしまう
  //    ちらつきバグの温床になる）。
  //
  // clearQuery は "full"（デフォルト。クエリを完全に空文字へ戻す）と "prefixOnly"
  // （プレフィックス部分（例: "/recent"）だけを残す）の2パターン。cleanup は
  // 呼び出し元ごとに異なる結果クリア・frecency 記録等を渡す（省略可）。
  const closeWindow = useCallback(
    async (options?: {
      clearQuery?: "full" | "prefixOnly";
      prefix?: string;
      cleanup?: () => void | Promise<void>;
    }) => {
      await hideWindow();
      if ((options?.clearQuery ?? "full") === "prefixOnly") {
        setQuery(options?.prefix ?? "");
      } else {
        setQuery("");
      }
      bumpCloseRefreshTick();
      await options?.cleanup?.();
    },
    [bumpCloseRefreshTick]
  );

  // 検索ボックスへの貼り付けイベントのたびに呼ぶ。クリップボードに CF_HDROP
  // （Explorer での通常コピー時に付与される実体パス一覧）が存在し、かつパスが単一の
  // 場合のみ、そのパスの文字列を検索ボックスにそのまま流し込む（クォート等の加工は
  // しない）。複数パスの場合・CF_HDROP が存在しない場合は何もしない（後者は OS 標準の
  // ペースト処理にそのまま委ねる）。流し込んだ文字列に対する実在パス判定（クォート
  // 有無を問わない）は、通常のテキスト貼り付け・手入力と全く同じ経路（下記メインの
  // 検索 useEffect が query の変化として検知し、judge_pasted_path を呼ぶ）で行う。
  // 詳細は 00-requirements.md「パス貼り付けによる検索フォルダ管理」節の
  // 「貼り付け内容の判定方法」を参照。
  const detectPastedPath = useCallback(() => {
    invoke<string | null>("read_pasted_hdrop_path")
      .then((path) => {
        if (path) {
          setQuery(path);
        }
      })
      .catch(console.error);
  }, []);

  const clearPathPaste = useCallback(() => {
    setPathPasteCandidate(null);
    setWizardStep("idle");
    setWizardFolders([]);
    setWizardSelectedFolder(null);
    setWizardName("");
  }, []);

  // 機能1: 検索フォルダとして追加。非表示を確定してから invoke を fire-and-forget
  // で起動する（詳細は「ウィンドウを閉じる系アクションの共通設計」節）。
  const addSearchFolderFromPaste = useCallback(async () => {
    if (!pathPasteCandidate) return;
    const path = pathPasteCandidate.path;
    await closeWindow({
      cleanup: () => {
        invoke("add_search_folder_from_paste", { path }).catch(console.error);
        clearPathPaste();
      },
    });
  }, [pathPasteCandidate, closeWindow, clearPathPaste]);

  // 機能2 ステップ1→2: 登録済みの検索フォルダ一覧を取得してフォルダ選択ステップへ進む
  // （PULL。フォーカス回復時の再取得は行わない。ウィザードは短時間の一時操作のため）。
  const startShortcutWizard = useCallback(() => {
    invoke<FolderEntry[]>("get_folders")
      .then((folders) => {
        setWizardFolders(folders);
        setWizardStep("folderSelect");
      })
      .catch(console.error);
  }, []);

  // 機能2 ステップ2→3: フォルダを選択し、名前編集欄のデフォルト値を元のファイル/
  // フォルダ名にする。
  const selectWizardFolder = useCallback(
    (folder: FolderEntry) => {
      setWizardSelectedFolder(folder);
      setWizardName(pathPasteCandidate?.name ?? "");
      setWizardStep("nameEdit");
    },
    [pathPasteCandidate]
  );

  // 機能2 ステップ3: 非表示を確定してから保存を実行する。`.lnk` の作成自体（連番付与
  // 含む）は Rust 側が行う。
  const confirmShortcut = useCallback(async () => {
    if (!pathPasteCandidate || !wizardSelectedFolder) return;
    const targetPath = pathPasteCandidate.path;
    const folderPath = wizardSelectedFolder.path;
    const name = wizardName;
    await closeWindow({
      cleanup: () => {
        invoke("create_shortcut", { targetPath, folderPath, name }).catch(console.error);
        clearPathPaste();
      },
    });
  }, [
    pathPasteCandidate,
    wizardSelectedFolder,
    wizardName,
    closeWindow,
    clearPathPaste,
  ]);

  // Escape: ウィザードを1ステップ前に戻す（名前編集→フォルダ選択、
  // フォルダ選択→候補行表示 or 通常のファイル検索結果表示）。
  const wizardBack = useCallback(() => {
    setWizardStep((step) => (step === "nameEdit" ? "folderSelect" : "idle"));
  }, []);

  const pathPasteWizardMode = wizardStep !== "idle";

  const [rawRecentFiles, setRawRecentFiles] = useState<RecentFile[]>([]);

  // 非同期呼び出し（search_files・get_recent_files 等）に世代 ID を振り、.then() 発火
  // 時点で自分が最新の呼び出しかどうかを確認してから結果を反映するための仕組み。
  // モード名をキーにした単一の ref にまとめることで、新しい "/" プレフィックスモードが
  // 増えるたびに専用の ref を追加しなくても済むようにしている
  // （beginAsyncCall(key) で世代を進めて呼び出し直前の ID を取得し、
  // isLatestAsyncCall(key, id) で .then() 側から「自分がまだ最新か」を確認する）。
  //
  // 【過去に発生した不具合】search_files 用と get_recent_files 用の世代 ID をかつて
  // 1本のカウンタで共有していた頃、Shift+Enter でファイルの格納フォルダを開く
  // （openContainingFolder）と、開いた Explorer が前面に出て WinLauncher のウィンドウが
  // 一時的にフォーカスを失う。`/recent` モードのままこの操作をした場合、フォーカス喪失→
  // 回復のタイミングによっては recentMode の focus-regain リスナー（下記）が
  // fetchRecentFiles を呼び、共有カウンタを1つ進めてしまうことがあった。その直後に
  // openContainingFolder 側の setQuery("") で発火した「search_files("") の再取得」
  // （通常表示に戻すための呼び出し）が解決した時点で「もう自分は最新の呼び出しではない」
  // と誤判定され、結果が握りつぶされて results が空のまま固まって見えていた。
  // "search" と "recent" を別キーに分離し、get_recent_files 側の呼び出しが
  // search_files 側の呼び出しに巻き込まれて破棄されないようにすることで解消した。
  // 今後モードを追加する場合も、既存キーを使い回さず新しいキー名を割り当てること
  // （同一キーの共有＝過去の不具合の再発につながる）。
  const asyncCallIdRef = useRef<Record<string, number>>({});

  const beginAsyncCall = useCallback((key: string): number => {
    const id = (asyncCallIdRef.current[key] ?? 0) + 1;
    asyncCallIdRef.current[key] = id;
    return id;
  }, []);

  const isLatestAsyncCall = useCallback((key: string, id: number): boolean => {
    return asyncCallIdRef.current[key] === id;
  }, []);

  // 通常ファイル検索のlatest-wins＋cooperative cancellation用ディスパッチャ。
  // 実行中は最大1件（searchInFlightRef）とし、実行中に新しい検索文字列を受け付けた
  // 場合は待機要求を最新1件だけで上書きする（searchQueueRef。途中の文字列をFIFOで
  // 蓄積しない）。Rust側の実行中世代（`SEARCH_GENERATION`）は、待機中でもキュー
  // 投入と同時に`set_search_generation`で即座に更新し、実行中の`search_files`が
  // 次の確認箇所で自身をobsoleteと検知できるようにする（invoke自体は1件ずつ直列に
  // 発行するが、実行中の重い同期処理を割り込んで早期終了させるための軽量な合図は
  // 別送する。詳細は`external-design/05-file-search-and-shell-icons.md
  // #file-search-loading-state`を参照）。
  //
  // 世代番号自体は上の asyncCallIdRef の "search" キーをそのまま流用する
  // （JS側の「最新の呼び出しか」判定とRust側の「最新の世代か」判定を同じ数値で
  // 表現できるため、専用のカウンタを別に持たない）。
  const searchInFlightRef = useRef(false);
  const searchQueueRef = useRef<{
    generation: number;
    query: string;
    excludePaths: string[];
  } | null>(null);

  // 検索欄周囲のスピナー表示。「検索中…」の一覧行は廃止し、直前に完了した
  // ファイル検索結果は最新世代が確定するまでそのまま表示し続ける（外部設計
  // 「通常ファイル検索の候補収集と更新制御」図2を参照）。searchBusyRef は
  // 「実行中または待機要求が存在する、一続きの検索中状態」かどうかを表す
  // （100ms未満で終わればスピナーは一度も見えない）。searchBusyTimerRef は
  // その状態でのみ生存する100ms猶予タイマーのid。
  const [searchSpinnerVisible, setSearchSpinnerVisible] = useState(false);
  const searchBusyRef = useRef(false);
  const searchBusyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アイドル状態から検索中状態へ移行した時だけ100ms監視を開始する。既に検索中
  // （searchBusyRef.current）であれば、新しい世代を受け付けても監視を再起動しない
  // （「検索中に新しい世代を受け付けても100ms監視を再起動しない」を参照）。
  const startSearchBusy = useCallback(() => {
    if (searchBusyRef.current) return;
    searchBusyRef.current = true;
    searchBusyTimerRef.current = setTimeout(() => {
      searchBusyTimerRef.current = null;
      setSearchSpinnerVisible(true);
    }, 100);
  }, []);

  // 実行中・待機要求のいずれも無くなった時点（アイドルへ戻った時点）、または
  // 通常検索コンテキストを離れる時点で呼ぶ。100ms未満で完了した場合はタイマーを
  // 破棄するだけでスピナーは一度も表示されない。
  const endSearchBusy = useCallback(() => {
    searchBusyRef.current = false;
    if (searchBusyTimerRef.current !== null) {
      clearTimeout(searchBusyTimerRef.current);
      searchBusyTimerRef.current = null;
    }
    setSearchSpinnerVisible(false);
  }, []);

  // runQueuedSearchRef.current は毎レンダー最新の frecency/isLatestAsyncCall を
  // 捕捉するクロージャで上書きする（focusRegainTableRef.current と同じ「最新値を
  // 保持するref」パターン）。.finally() からの再帰呼び出しは常にこのref経由で行う
  // ため、useCallbackの循環依存を避けつつ古いクロージャを参照する心配がない。
  const runQueuedSearchRef = useRef<() => void>(() => {});
  runQueuedSearchRef.current = () => {
    const next = searchQueueRef.current;
    if (!next) {
      searchInFlightRef.current = false;
      endSearchBusy();
      return;
    }
    searchQueueRef.current = null;
    searchInFlightRef.current = true;
    const { generation, query, excludePaths } = next;
    invoke<FileEntry[]>("search_files", { generation, query, excludePaths })
      .then((files) => {
        if (isLatestAsyncCall("search", generation)) {
          // 到着時点で表示中の直前結果と一括置換する（結果が空でも同様。
          // 選択識別子の維持・先頭フォールバックは rows の変化を検知する
          // 既存の useLayoutEffect が resolveSelected 経由で行う）。
          setResults(sortByFrecency(files, frecency));
        }
      })
      .catch((err) => {
        console.error(err);
        if (isLatestAsyncCall("search", generation)) {
          // エラー時も保持結果を消去する（表1「最新世代が空結果または
          // エラーで完了した場合は...消去する」を参照）。
          setResults([]);
        }
      })
      .finally(() => {
        runQueuedSearchRef.current();
      });
  };

  // 通常検索以外のモード（/recent・お気に入り・クリップボード履歴・
  // プレフィックスコマンド・パス貼り付けウィザード）へ移行する際に呼ぶ。
  // フロントエンド側の世代を進めて「search」キーの最新性を握り、実行中・
  // 待機中の通常検索が（開始済みの同期I/Oはそのまま進行させつつ）自身を
  // obsoleteと検知できるようにしたうえで、保持していた待機要求を破棄し、
  // スピナーも即座に終了する。開始済みのinvoke自体は強制停止しない
  // （戻ってきた時点でisLatestAsyncCallがfalseになるため、その結果は
  // resultsへ反映されない）。
  const abandonSearchOnModeExit = useCallback(() => {
    const generation = beginAsyncCall("search");
    invoke("set_search_generation", { generation }).catch(() => {});
    searchQueueRef.current = null;
    endSearchBusy();
  }, [beginAsyncCall, endSearchBusy]);

  // 別モードから通常検索コンテキストへ戻った直後かどうかを判定するための
  // 「直前は通常検索コンテキストだったか」のミラー。通常検索コンテキストへ
  // 戻った最初の1回だけ、保持していた（別モードの一覧かもしれない）results を
  // 空にし、最新結果が確定するまでファイル結果を表示しない（表2「別のモードから
  // 通常検索へ移行」を参照）。それ以降、通常検索コンテキスト内に留まる限りは
  // クエリ変更のたびに results を消去しない（保持し続ける）。
  const wasNormalSearchContextRef = useRef(true);

  // 直近にキーボード（↑↓）で選択操作を行った時刻。
  const lastKeyboardNavAtRef = useRef(0);

  // 直近に実際のマウス移動（mousemove）で観測されたクライアント座標。
  // onMouseEnter はカーソルが静止したまま一覧の再描画・スクロールで行が入れ替わっただけ
  // でも発火し得るため、「本当にマウスが動いた結果の hover か」を判定する基準にする。
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // キーボードによる選択操作。ホバー抑止の基準時刻を更新してから反映する。
  const setSelected = useCallback(
    (value: number | ((prev: number) => number)) => {
      lastKeyboardNavAtRef.current = Date.now();
      setSelectedRaw(value);
    },
    []
  );

  // ルートコンテナの onMouseMove から呼ぶ。実際にカーソルが動いた座標だけを記録する
  // （onMouseEnter 自体からは更新しない。mouseenter は、同じ物理的な移動に対して発火する
  // mousemove より先に発火するため、比較時点ではまだ「移動前」の座標が残っている）。
  const recordMouseMove = useCallback((clientX: number, clientY: number) => {
    lastMousePosRef.current = { x: clientX, y: clientY };
  }, []);

  // マウスホバー（onMouseEnter）による選択操作。以下のいずれかに該当する場合は、
  // ユーザーの意図的な操作ではないとみなして無視する。
  // 1. 直近のキーボード操作から HOVER_SUPPRESS_AFTER_KEYBOARD_MS 以内（従来からの判定）
  // 2. mouseenter 発火時点の座標が、直近に実際のマウス移動で観測された座標と
  //    実質的に同じ（＝カーソル自体は静止しており、一覧の再描画・スクロールで
  //    たまたまその行がカーソル直下に来ただけ）
  const selectFromHover = useCallback(
    (index: number, clientX: number, clientY: number) => {
      if (Date.now() - lastKeyboardNavAtRef.current < HOVER_SUPPRESS_AFTER_KEYBOARD_MS) {
        return;
      }
      const last = lastMousePosRef.current;
      const cursorStationary =
        last !== null &&
        Math.abs(last.x - clientX) < 1 &&
        Math.abs(last.y - clientY) < 1;
      if (cursorStationary) {
        return;
      }
      setSelectedRaw(index);
    },
    []
  );

  // R-1 フェーズD-2: 通常モード（rows）／clipboardMode（clipboardSelectionItems）
  // の選択は intent の更新のみで表現する。selected 自体への直接書き込みは行わない
  // （導出は rows/clipboardSelectionItems の直後で定義する useLayoutEffect が
  // 一括して行う。詳細は本ファイル冒頭の SelectIntent 型・resolveSelected の
  // コメントを参照）。
  const [intent, setIntentState] = useState<SelectIntent>({ type: "top" });

  const updateIntent = useCallback((next: SelectIntent, source: string) => {
    console.debug(
      `[selectIntent] updated (source=${source}, type=${next.type}` +
        (next.type === "key"
          ? `, key="${next.key}", expiresAt=${
              next.expiresAt !== undefined ? "yes" : "no"
            }`
          : "") +
        `)`
    );
    setIntentState(next);
  }, []);

  // clipboardMode 中の選択対象一覧。useClipboard.ts が clipboardEntries の変化を
  // 検知して syncClipboardSelectionItems（return オブジェクトを参照）経由で
  // 反映する（useSearch は useClipboard の戻り値に依存できない構成のため、
  // 逆方向＝useClipboard 側から push してもらう形にしている）。
  const [clipboardSelectionItems, setClipboardSelectionItems] = useState<
    SelectableItem[]
  >([]);

  // キーボード（↑↓）による通常モード／clipboardMode の選択。ホバー抑止の基準時刻を
  // 更新してから intent を更新する（生インデックス版の setSelected と同じ前処理）。
  const selectRowByKeyboard = useCallback((key: string) => {
    lastKeyboardNavAtRef.current = Date.now();
    updateIntent({ type: "key", key }, "keyboard");
  }, [updateIntent]);

  // マウスホバーによる通常モード／clipboardMode の選択。抑止判定（直近のキーボード
  // 操作からの経過時間、カーソル静止判定）は生インデックス版の selectFromHover と同一。
  const selectRowFromHover = useCallback(
    (key: string, clientX: number, clientY: number) => {
      if (Date.now() - lastKeyboardNavAtRef.current < HOVER_SUPPRESS_AFTER_KEYBOARD_MS) {
        return;
      }
      const last = lastMousePosRef.current;
      const cursorStationary =
        last !== null &&
        Math.abs(last.x - clientX) < 1 &&
        Math.abs(last.y - clientY) < 1;
      if (cursorStationary) {
        return;
      }
      updateIntent({ type: "key", key }, "hover");
    },
    [updateIntent]
  );

  const calcMode = appSettings.calcEnabled && isCalcExpression(query);

  // issue 0024：クリップボード履歴・最近使ったファイルのローカル絞り込み文字列。
  // お気に入り編集ビューの favoriteEditFilterText と同じく、画面上部の専用入力欄に
  // 束縛する独立したstateとして持つ（検索ボックスのqueryからは導出しない）。
  // 呼び出しキーワードに続けて入力した文字列は入力時点で破棄し、空から開始する。
  const [clipboardEditFilterText, setClipboardEditFilterText] = useState("");
  const [recentEditFilterText, setRecentEditFilterText] = useState("");

  const clipboardMode =
    appSettings.clipboardEnabled &&
    hasPrefixMatch(query, appSettings.clipboardPrefix);
  const clipboardFilterText = clipboardMode ? clipboardEditFilterText : null;
  const recentMode =
    appSettings.recentFilesEnabled &&
    hasPrefixMatch(query, appSettings.recentKeyword);
  const recentFilterText = recentMode ? recentEditFilterText : null;
  const favoriteFilterText = appSettings.favoriteEnabled
    ? favoriteModeFilter(query, appSettings.favoriteKeyword)
    : null;
  const favoriteMode = favoriteFilterText !== null;

  // ピン止めブロックの表示条件（検索ボックスが空、機能ON、他の排他モードでない）。
  // calcMode/prefixCommandMode は入力文字種上クエリが空の間は構造的に成立しない
  // （isCalcExpression は空文字を false、buildPrefixCommandCandidates は "/" で
  // 始まらないクエリを [] にする）ため、ここで明示的に除外する必要はない。
  const pinnedVisible =
    appSettings.pinEnabled &&
    query === "" &&
    !clipboardMode &&
    !recentMode &&
    !favoriteMode;

  // ピン止め・お気に入り・メモの生ノード配列（隣接リスト方式。詳細は
  // 00-requirements.md/CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
  // frecency と同様、useCallback の古いクロージャに残った state を参照してしまうのを
  // 避けるため useRef の鏡（favoritesRef）を併用する。アプリ起動時に一度だけ取得する
  // （frecency のように App.tsx 経由の Store ではなく、Rust コマンド経由で直接取得する。
  // 「フロントエンド直接操作は採用しない」方針のため）。
  const [favorites, setFavoritesState] = useState<FavoriteNode[]>([]);
  const favoritesRef = useRef<FavoriteNode[]>([]);

  useEffect(() => {
    invoke<FavoriteNode[]>("get_favorites")
      .then((data) => {
        favoritesRef.current = data;
        setFavoritesState(data);
      })
      .catch(console.error);
  }, []);

  // ピン止め済みパスの集合。search_files の除外引数（クエリが空のときのみ渡す）と、
  // 通常のファイル検索結果行のピンアイコンの塗りつぶし判定の両方に使う。
  const pinnedPathSet = useMemo(() => {
    const set = new Set<string>();
    for (const f of favorites) {
      if (f.parentId === PINNED_FOLDER_ID && f.type === "file") {
        set.add(f.value);
      }
    }
    return set;
  }, [favorites]);

  const isPinned = useCallback(
    (path: string) => pinnedPathSet.has(path),
    [pinnedPathSet]
  );

  // お気に入り登録済みパスの集合。ピン止めの pinnedPathSet と同じ考え方（同じ
  // favorites 配列から局所的に導出し、行ごとの★表示・重複判定のためだけに Rust への
  // IPC 呼び出しを行わない）だが、お気に入りは「お気に入り」予約フォルダ配下に
  // ツリー構造で整理できるため、直接の parentId 比較ではなく isDescendantOfFolder で
  // 祖先を辿って判定する。重複の判定基準はパス文字列の完全一致（実体の同一性では
  // ない。00-requirements.md「お気に入り機能」節「★アイコン」を参照）。
  const favoritePathSet = useMemo(() => {
    const set = new Set<string>();
    for (const f of favorites) {
      if (
        f.type === "file" &&
        isDescendantOfFolder(favorites, f.parentId, FAVORITES_FOLDER_ID)
      ) {
        set.add(f.value);
      }
    }
    return set;
  }, [favorites]);

  const isFavorited = useCallback(
    (path: string) => favoritePathSet.has(path),
    [favoritePathSet]
  );

  // ピン止めブロック表示用（シェルアイコン付き、order 順ソート済み）。favorites とは
  // 別に、表示専用のPULL取得として持つ（アイコン取得は Rust 側で行う必要があるため）。
  const [pinnedFiles, setPinnedFiles] = useState<FileEntry[]>([]);
  // ピン止めした各ファイル・フォルダの実体有無（パス→真偽値）。
  const [pinnedExistence, setPinnedExistence] = useState<Record<string, boolean>>({});

  // recentMode の間、現在アクティブな取得を上書きしないよう世代 ID で保護しつつ
  // get_recent_files を呼び直す（クリップボード履歴と異なりプッシュ通知がなく、
  // 明示的に取得し直さない限りウィンドウ非表示中に開いた/削除したファイルが
  // 反映されないため）。
  const fetchRecentFiles = useCallback((source: string) => {
    const callId = beginAsyncCall("recent");
    console.debug(`[recent] fetch start (source=${source}, callId=${callId})`);
    invoke<RecentFile[]>("get_recent_files")
      .then((files) => {
        if (!isLatestAsyncCall("recent", callId)) {
          console.debug(
            `[recent] fetch discarded (source=${source}, callId=${callId}, current=${asyncCallIdRef.current["recent"]})`
          );
          return; // 古い呼び出しの結果は破棄する
        }
        console.debug(`[recent] fetch resolved (source=${source}, count=${files.length})`);
        setRawRecentFiles(files);
      })
      .catch((err) => {
        console.error(`[recent] fetch failed (source=${source}):`, err);
      });
  }, [beginAsyncCall, isLatestAsyncCall]);

  // 最近使ったファイル一覧モードに入ったタイミング（false → true の遷移）で取得する。
  // フィルタ文字列の変更ごとには再取得せず、既に取得済みの一覧をフロントエンド側で
  // フィルタするだけにする。
  useEffect(() => {
    if (!recentMode) return;
    fetchRecentFiles("mode-enter");
  }, [recentMode, fetchRecentFiles]);

  // ピン止めブロックのデータ（アイコン付きファイル一覧）と実体有無を取得する。
  // get_pinned_files → check_paths_exist の順に呼び、両方の結果を同一の世代 ID
  // （"pinned" キー）で保護する。存在確認のタイミングは 00-requirements.md
  // 「ピン止め・お気に入り・メモ機能」節の通り、ブロック表示時とフォーカス復帰時の
  // 2箇所（このコールバックがその両方から呼ばれる。呼び出し箇所は下記2つの useEffect
  // を参照）。
  const fetchPinnedFiles = useCallback((source: string) => {
    const callId = beginAsyncCall("pinned");
    invoke<FileEntry[]>("get_pinned_files")
      .then((files) => {
        if (!isLatestAsyncCall("pinned", callId)) return;
        setPinnedFiles(files);
        return invoke<boolean[]>("check_paths_exist", {
          paths: files.map((f) => f.path),
        }).then((existsList) => {
          if (!isLatestAsyncCall("pinned", callId)) return;
          const map: Record<string, boolean> = {};
          files.forEach((f, i) => {
            map[f.path] = existsList[i] ?? true;
          });
          setPinnedExistence(map);
        });
      })
      .catch((err) => {
        console.error(`[pinned] fetch failed (source=${source}):`, err);
      });
  }, [beginAsyncCall, isLatestAsyncCall]);

  // ピン止めブロックが表示状態になったタイミング（false → true の遷移）で取得する
  // （/recent の mode-enter と同じ考え方。「表示のたび」に該当する）。
  useEffect(() => {
    if (!pinnedVisible) return;
    fetchPinnedFiles("mode-enter");
  }, [pinnedVisible, fetchPinnedFiles]);

  // /favorite モードの一覧データ（フォルダ構造込みの生ノード。表示用のツリー
  // フラット化・フィルタリングは favoriteTree 側で行う）と、file 型ノードの実体有無。
  // get_favorite_nodes → check_paths_exist の順に呼び、両方を同一の世代ID
  // （"favorite" キー）で保護する（fetchPinnedFiles と同じ2段構成）。
  const [rawFavoriteNodes, setRawFavoriteNodes] = useState<FavoriteNode[]>([]);
  const [favoriteExistence, setFavoriteExistence] = useState<
    Record<string, boolean>
  >({});
  // お気に入りは通常検索・ピン止めと異なり既存のShellアイコン取得経路を持たないため、
  // `get_icons_for_paths`（汎用バッチ取得コマンド）で別途取得する（詳細は CLAUDE.md
  // 「Shellアイコン表示」節を参照。既存のピン止め・通常検索の経路は無理に共有しない）。
  const [favoriteIcons, setFavoriteIcons] = useState<
    Record<string, string | null>
  >({});

  // お気に入り編集ビュー専用の絞り込み文字列（軸4g）。/favorite ブラウジング側の
  // favoriteFilterText はメイン検索ボックスの query から導出される値だが、編集
  // ビューは常時表示の専用検索ボックスを持つため、それとは独立した state として
  // 持つ（00-requirements.md「お気に入り編集ビュー」節を参照）。
  const [favoriteEditFilterText, setFavoriteEditFilterText] = useState("");

  const fetchFavoriteNodes = useCallback(
    (source: string) => {
      const callId = beginAsyncCall("favorite");
      invoke<FavoriteNode[]>("get_favorite_nodes")
        .then((nodes) => {
          if (!isLatestAsyncCall("favorite", callId)) return;
          setRawFavoriteNodes(nodes);
          const fileNodes = nodes.filter((n) => n.type === "file");
          const paths = fileNodes.map((n) => n.value);
          return Promise.all([
            invoke<boolean[]>("check_paths_exist", { paths }),
            invoke<(string | null)[]>("get_icons_for_paths", { paths }),
          ]).then(([existsList, iconsList]) => {
            if (!isLatestAsyncCall("favorite", callId)) return;
            const existsMap: Record<string, boolean> = {};
            const iconsMap: Record<string, string | null> = {};
            fileNodes.forEach((n, i) => {
              existsMap[n.value] = existsList[i] ?? true;
              iconsMap[n.value] = iconsList[i] ?? null;
            });
            setFavoriteExistence(existsMap);
            setFavoriteIcons(iconsMap);
          });
        })
        .catch((err) => {
          console.error(`[favorite] fetch failed (source=${source}):`, err);
        });
    },
    [beginAsyncCall, isLatestAsyncCall]
  );

  // /favorite モードに入ったタイミング（false → true の遷移）で取得する
  // （/recent の mode-enter と同じ考え方）。
  useEffect(() => {
    if (!favoriteMode) return;
    fetchFavoriteNodes("mode-enter");
  }, [favoriteMode, fetchFavoriteNodes]);

  // フォルダの開閉状態（軸3）は FavoriteNode.collapsed としてRust側へ永続化し、
  // /favorite ブラウジング・お気に入り編集ビューの両方でそのまま共有する
  // （クライアント専用の Set 状態は廃止した。別々の開閉状態は持たせない。
  // 00-requirements.md「フォルダの開閉状態（collapsed）の永続化と絞り込みとの関係」節を
  // 参照）。
  const setFavoriteFolderCollapsed = useCallback(
    (folderId: string, collapsed: boolean) => {
      invoke<FavoriteNode[]>("set_favorite_folder_collapsed", {
        id: folderId,
        collapsed,
      })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          setRawFavoriteNodes(deriveFavoriteNodesFromFavorites(saved));
        })
        .catch(console.error);
    },
    []
  );

  // フォルダ見出し行の開閉トグルの実処理（ガード抜き）。/favorite ブラウジング・
  // お気に入り編集ビューはそれぞれ独立した絞り込み文字列（favoriteFilterText／
  // favoriteEditFilterText）を持つため、「絞り込み中は無効化する」ガードは
  // 呼び出し元ごとに別々の値で判定する必要がある（一方の画面の絞り込み文字列を
  // 参照して他方の画面の操作を誤ってブロックしないように、実処理とガードを
  // 分離する）。
  const performToggleFavoriteFolderCollapsed = useCallback(
    (folderId: string) => {
      const current = rawFavoriteNodes.find((n) => n.id === folderId);
      setFavoriteFolderCollapsed(folderId, !(current?.collapsed ?? false));
    },
    [rawFavoriteNodes, setFavoriteFolderCollapsed]
  );

  // /favorite ブラウジング（▼クリック・Enterキー）用。絞り込み（横断検索）文字列が
  // 1文字以上入力されている間は無効化する（no-op）。絞り込みでヒットしたフォルダは
  // favoriteTree 側で表示上強制展開されるだけで永続化された collapsed は書き換わら
  // ないため、絞り込み中に操作を許すと「見えている状態」と「実際に保存される状態」が
  // 食い違ってしまうため（00-requirements.md同節を参照）。
  const toggleFavoriteFolderCollapsed = useCallback(
    (folderId: string) => {
      if ((favoriteFilterText ?? "").length > 0) return;
      performToggleFavoriteFolderCollapsed(folderId);
    },
    [favoriteFilterText, performToggleFavoriteFolderCollapsed]
  );

  // お気に入り編集ビュー（▼クリック・Enterキー）用。上と同じ理由で、編集ビュー
  // 自身の絞り込み文字列（favoriteEditFilterText）でガードする。
  const toggleFavoriteFolderCollapsedInEdit = useCallback(
    (folderId: string) => {
      if (favoriteEditFilterText.length > 0) return;
      performToggleFavoriteFolderCollapsed(folderId);
    },
    [favoriteEditFilterText, performToggleFavoriteFolderCollapsed]
  );

  // pull型モード（get_recent_files 等、プッシュ通知を持たない取得）のうち、フォーカス
  // 回復時に再取得が必要なものをキーで宣言するテーブル。クリップボード履歴は OS の
  // クリップボード変更通知を常時受信しているため表示中の内容が非表示中も自動で
  // 最新化されるが（push型）、最近使ったファイル一覧のような pull型モードには
  // そのようなプッシュ通知がなく、モード遷移時の1回きりの取得のままだと非表示中に
  // 発生した変化（ファイルを開く／削除する等）が次にモードへ入り直すまで反映されない。
  // 同じ「再表示時には常に最新の状態を見せる」という体験を push型モードと揃えるため、
  // フォーカス回復のたびにこのテーブルを見て active なモードだけ再取得する。
  //
  // 新しい pull型モードを追加する場合は、ここにエントリを1つ追加するだけでよい
  // （下記の onFocusChanged リスナー自体は特定モードを知らない汎用ロジックのみを持つ）。
  // レンダーのたびに最新の active 状態で上書きする「最新値を保持する ref」パターン
  // （かつての recentModeRef と同じ考え方を、モード横断で汎用化したもの）。
  const focusRegainTableRef = useRef<
    Record<string, { active: boolean; refetch: () => void }>
  >({});
  focusRegainTableRef.current = {
    recent: {
      active: recentMode,
      refetch: () => fetchRecentFiles("focus-regain"),
    },
    pinned: {
      active: pinnedVisible,
      refetch: () => fetchPinnedFiles("focus-regain"),
    },
    favorite: {
      active: favoriteMode,
      refetch: () => fetchFavoriteNodes("focus-regain"),
    },
  };

  useEffect(() => {
    // onFocusChanged の登録は非同期（Promise）のため、登録が完了するより先に
    // このエフェクトの cleanup が走ると（React 18 StrictMode の開発時
    // マウント→アンマウント→再マウントで起こり得る）、cleanup 時点では
    // unlisten がまだ undefined で何も解除できず、後から解決した Promise が
    // 誰にも解除されないリスナーを登録したままになる（二重登録）。
    // cancelled フラグで「登録が確定した時点で既に cleanup 済みなら即座に
    // 解除する」ようにし、このレースを防ぐ。
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        for (const [key, entry] of Object.entries(focusRegainTableRef.current)) {
          if (!entry.active) continue;
          console.debug(`[focus-regain] refetch (mode=${key})`);
          entry.refetch();
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 取得済みの一覧を表示名（.lnk はファイル名、.url は拡張子除去後の名称。
  // いずれも RecentFile.name に統一済み）への部分一致でフィルタする。
  // 既に最終アクセス日時降順で取得済みのため、フィルタ後も順序はそのまま維持される。
  //
  // RecentFile.path は .lnk 由来・.url 由来のいずれも実在確認済みのローカルパスに
  // 統一されているため（.url は OneDrive のローカル同期先パスへの変換に成功した
  // ものだけが一覧に含まれる）、既存の launchFile をそのまま使い回せる。
  const recentResults = useMemo<FileEntry[]>(() => {
    if (!recentMode) return [];
    const filterLower = (recentFilterText ?? "").toLowerCase();
    const filtered = filterLower
      ? rawRecentFiles.filter((f) => f.name.toLowerCase().includes(filterLower))
      : rawRecentFiles;
    return filtered.map((f) => ({ name: f.name, path: f.path, icon: f.icon }));
  }, [recentMode, recentFilterText, rawRecentFiles]);

  // /favorite モードの表示用ツリー（フォルダ見出し行＋アイテム行のフラット配列）。
  // 00-requirements.md「お気に入り機能」節「/favorite モード」の仕様：
  // - 表示構造はフラットな一覧にフォルダ見出し行を挟む形。フォルダ配下のアイテム行は
  //   見出し行より1段インデントする（`depth` で表現）
  // - 横断検索（`favoriteFilterText` が非空）の間は、表示名にヒットする file 型
  //   ノードと、その祖先フォルダの見出し行のみを残す。ヒットが1件もないフォルダの
  //   見出しは非表示にする（`folderHasMatch` の再帰判定）
  // - 横断検索中は、手動での折りたたみ状態を無視して常に展開する。折りたたみは
  //   「ブラウズ中に隠す」ための操作であり、検索は逆に「畳んだフォルダの中身も
  //   含めて見つける」ことが目的のため、両者が競合する場合は検索を優先する
  //   （00-requirements.mdに明記はないが、横断検索の目的に照らした判断。詳細は
  //   実装時の報告を参照）
  // - 検索していない場合（`favoriteFilterText` が空文字）は、空のフォルダ（配下に
  //   アイテムが1件もない）も見出し行として表示する
  const favoriteTree = useMemo<FavoriteTreeRow[]>(() => {
    const filterLower = (favoriteFilterText ?? "").toLowerCase();
    const filtering = filterLower.length > 0;

    // グループ化は1箇所（groupNodesByParent）のみで行う。同じ parentId の中では
    // フォルダ・ファイルを問わず order 昇順に並ぶ（隣接リストの共通前提。詳細は
    // src/lib/nodeTree.ts を参照）。以前はこの直下ファイル向けの走査とは別に
    // favoriteFolderOptions 側で独立した同等のグループ化・走査ロジックを持って
    // おり、重複していた（詳細は本ファイルの変更履歴・調査記録を参照）。
    const byParent = groupNodesByParent(rawFavoriteNodes);

    // フィルタ中、あるフォルダの配下（再帰）に表示名がヒットする file 型ノードが
    // 1件でも存在するかどうかをメモ化しながら判定する。
    const folderHasMatchCache = new Map<string, boolean>();
    const folderHasMatch = (folderId: string): boolean => {
      const cached = folderHasMatchCache.get(folderId);
      if (cached !== undefined) return cached;
      // 再帰前にプレースホルダーを置き、循環参照があっても無限再帰しないようにする
      // （現状の操作では循環は発生し得ないが、他の探索と同様に防御的に扱う）。
      folderHasMatchCache.set(folderId, false);
      let found = false;
      for (const child of byParent.get(folderId) ?? []) {
        if (child.type === "file") {
          if (child.name.toLowerCase().includes(filterLower)) {
            found = true;
            break;
          }
        } else if (child.type === "folder") {
          if (folderHasMatch(child.id)) {
            found = true;
            break;
          }
        }
      }
      folderHasMatchCache.set(folderId, found);
      return found;
    };

    const rows: FavoriteTreeRow[] = [];

    // 「上へ移動」「下へ移動」ボタンの有効/無効判定用。横断検索によるフィルタ表示
    // （一部の兄弟が非表示になり得る）の影響を受けないよう、常に byParent（実際の
    // 全兄弟。order 昇順ソート済み）を基準に先頭/末尾かどうかを判定する。
    const siblingEdgeInfo = (node: FavoriteNode) => {
      const siblings = byParent.get(node.parentId) ?? [];
      const pos = siblings.findIndex((s) => s.id === node.id);
      return {
        isFirstSibling: pos <= 0,
        isLastSibling: pos === -1 || pos === siblings.length - 1,
      };
    };

    walkGroupedTree(byParent, FAVORITES_FOLDER_ID, (node, depth) => {
      if (node.type === "folder") {
        if (filtering && !folderHasMatch(node.id)) {
          return { skipChildren: true };
        }
        const collapsed = filtering ? false : node.collapsed;
        rows.push({
          kind: "folder",
          key: favoriteFolderRowKey(node.id),
          node,
          depth,
          collapsed,
          // 直接の子ノード数（孫は含めない）。件数バッジ表示用。折りたたみ・
          // 横断検索によるフィルタの影響を受けない、実際の全直下件数を使う
          // （byParent は order 昇順にグループ化済みの「実際の兄弟」を保持する）。
          directChildCount: (byParent.get(node.id) ?? []).length,
          ...siblingEdgeInfo(node),
        });
        if (collapsed) {
          return { skipChildren: true };
        }
      } else if (node.type === "file") {
        if (filtering && !node.name.toLowerCase().includes(filterLower)) {
          return;
        }
        rows.push({
          kind: "item",
          key: favoriteItemRowKey(node.id),
          node,
          depth,
          file: { name: node.name, path: node.value, icon: favoriteIcons[node.value] ?? null },
          exists: favoriteExistence[node.value] ?? true,
          ...siblingEdgeInfo(node),
        });
      }
      // clipboard/command 型は今回未実装のため対象外（メモ機能実装時に追加）。
    });
    return rows;
  }, [rawFavoriteNodes, favoriteFilterText, favoriteExistence, favoriteIcons]);

  // お気に入り編集ビュー専用の絞り込み済みツリー（軸4g）。上の favoriteTree
  // （/favorite ブラウジング用）と異なる点は2つ：
  // (1) ヒット判定にファイル名だけでなくフォルダ名自体も含める
  // (2) フォルダ名自体がヒットした場合、その配下は絞り込まず全件（サブフォルダ・
  //     アイテムとも）表示する
  // (2)は「祖先が既にヒット確定したか」という文脈を子へ伝播する必要があり、
  // 既存の walkGroupedTree（visit コールバックが親から子へ文脈を渡せない汎用
  // ユーティリティ）では表現できないため、この専用の再帰関数で書く（favoriteTree
  // 側の走査は変更しない）。groupNodesByParent は共通のまま再利用する。
  const favoriteEditRawTree = useMemo<FavoriteTreeRow[]>(() => {
    const filterLower = favoriteEditFilterText.toLowerCase();
    const filtering = filterLower.length > 0;
    const byParent = groupNodesByParent(rawFavoriteNodes);

    // 配下（再帰）に、アイテム名またはフォルダ名自体がヒットするノードが1件でも
    // 存在するか（自分自身のフォルダ名も対象に含める点が favoriteTree の
    // folderHasMatch と異なる）。
    const subtreeMatchCache = new Map<string, boolean>();
    const subtreeHasMatch = (folderId: string): boolean => {
      const cached = subtreeMatchCache.get(folderId);
      if (cached !== undefined) return cached;
      subtreeMatchCache.set(folderId, false);
      let found = false;
      for (const child of byParent.get(folderId) ?? []) {
        if (child.type === "file") {
          if (child.name.toLowerCase().includes(filterLower)) {
            found = true;
            break;
          }
        } else if (child.type === "folder") {
          if (
            child.name.toLowerCase().includes(filterLower) ||
            subtreeHasMatch(child.id)
          ) {
            found = true;
            break;
          }
        }
      }
      subtreeMatchCache.set(folderId, found);
      return found;
    };

    const rows: FavoriteTreeRow[] = [];
    const siblingEdgeInfo = (node: FavoriteNode) => {
      const siblings = byParent.get(node.parentId) ?? [];
      const pos = siblings.findIndex((s) => s.id === node.id);
      return {
        isFirstSibling: pos <= 0,
        isLastSibling: pos === -1 || pos === siblings.length - 1,
      };
    };

    // insideMatchedFolder: 祖先のいずれかのフォルダ名自体が既にヒット済みの場合
    // true。true の間は配下を一切フィルタせず全件表示する（フォルダ名ヒットの
    // 「配下は絞り込まず全件表示」仕様）。
    const walk = (
      parentId: string,
      depth: number,
      insideMatchedFolder: boolean
    ) => {
      for (const node of byParent.get(parentId) ?? []) {
        if (node.type === "folder") {
          const selfMatches =
            filtering && node.name.toLowerCase().includes(filterLower);
          const visible =
            insideMatchedFolder || !filtering || selfMatches || subtreeHasMatch(node.id);
          if (!visible) continue;
          const collapsed = filtering ? false : node.collapsed;
          rows.push({
            kind: "folder",
            key: favoriteFolderRowKey(node.id),
            node,
            depth,
            collapsed,
            directChildCount: (byParent.get(node.id) ?? []).length,
            ...siblingEdgeInfo(node),
          });
          if (collapsed) continue;
          walk(node.id, depth + 1, insideMatchedFolder || selfMatches);
        } else if (node.type === "file") {
          const visible =
            insideMatchedFolder ||
            !filtering ||
            node.name.toLowerCase().includes(filterLower);
          if (!visible) continue;
          rows.push({
            kind: "item",
            key: favoriteItemRowKey(node.id),
            node,
            depth,
            file: { name: node.name, path: node.value, icon: favoriteIcons[node.value] ?? null },
            exists: favoriteExistence[node.value] ?? true,
            ...siblingEdgeInfo(node),
          });
        }
      }
    };
    walk(FAVORITES_FOLDER_ID, 0, false);
    return rows;
  }, [rawFavoriteNodes, favoriteEditFilterText, favoriteExistence, favoriteIcons]);

  // favoriteTree からアイテム行のみを抜き出したもの。軸1で↑↓キーによる選択移動・
  // intent ベースの選択解決（resolveSelected）の対象一覧は favoriteTree（フォルダ
  // 見出し行込み）へ拡張したため、この一覧はもう選択ドメインとしては使わない。
  // toggleFavorite の★解除時に「次に選ぶべき隣接アイテム」を探す用途（フォルダ
  // 見出し行は解除の影響を受けないため対象外でよい）でのみ使う。
  const favoriteSelectionItems = useMemo(
    () => favoriteTree.filter((r) => r.kind === "item"),
    [favoriteTree]
  );

  // クリップボード履歴モード・最近使ったファイル一覧モード（完全な呼び出しキーワードが
  // 入力済み）・パス貼り付けのショートカット配置ウィザード進行中が有効な間は、
  // 候補一覧ではなくそれぞれの専用モードを優先する。
  const prefixCommandCandidates = useMemo(
    () =>
      calcMode ||
      clipboardMode ||
      recentMode ||
      favoriteMode ||
      pathPasteWizardMode
        ? []
        : sortPrefixCommandsByFrecency(
            buildPrefixCommandCandidates(query, appSettings),
            prefixCommandFrecency
          ),
    [
      calcMode,
      clipboardMode,
      recentMode,
      favoriteMode,
      pathPasteWizardMode,
      query,
      appSettings,
      prefixCommandFrecency,
    ]
  );
  const prefixCommandMode = prefixCommandCandidates.length > 0;

  // URLエンコード/デコード結果はファイル検索結果を置き換えず、その先頭付近に共存表示する
  // （prefixCommandMode/clipboardMode/recentMode/favoriteMode/pathPasteWizardMode
  // のような排他モードにはしない）。calcMode（数式らしい入力）は isCalcExpression の
  // 許容文字クラスが数字・演算子・括弧・空白・小数点のみでレターを含まないため、
  // `http(s)://` から始まる URL 的な入力とは構造上同時に true にならない。よってここで
  // calcMode を明示的に除外しなくても urlConvertResult と calcResult が同時に
  // 発生することはない。
  const urlConvertResult = useMemo(() => {
    if (!appSettings.urlConvertEnabled) return null;
    if (
      prefixCommandMode ||
      clipboardMode ||
      recentMode ||
      favoriteMode ||
      pathPasteWizardMode
    ) {
      return null;
    }
    return detectUrlConvertResult(query, appSettings.urlConvertKeepSpaceEncoded);
  }, [
    appSettings.urlConvertEnabled,
    appSettings.urlConvertKeepSpaceEncoded,
    prefixCommandMode,
    clipboardMode,
    recentMode,
    favoriteMode,
    pathPasteWizardMode,
    query,
  ]);

  // 通常検索コンテキストにいるかどうか（外部設計「通常検索における選択維持の
  // 適用境界」を参照）。この5モードのいずれにも該当しない状態を「通常検索の
  // 同一コンテキスト」とする。数式・URL・Web検索・パス貼り付け候補などの固定候補が
  // 表示されているかどうかは、この判定を変えない（`prefixCommandMode`は候補が
  // 実際に発生している場合のみtrueになるため、固定候補の一種である計算式のみの
  // 入力等では引き続きfalseのまま＝通常検索コンテキストに留まる）。
  const specialMode =
    clipboardMode || recentMode || favoriteMode || prefixCommandMode || pathPasteWizardMode;

  // R-1 フェーズD-2: intent を {type:'top'} へ更新する専用トリガーその1。
  // クエリ・設定・「ウィンドウを閉じた直後の強制再取得」（closeRefreshTick）の
  // いずれかが変化した場合にのみ発火する（＝ユーザーが新しい検索文脈に入った、
  // または明示的に設定を変更した場合）。
  //
  // 【フェーズDのリグレッションを踏まえた設計上の要点】この効果の依存配列に
  // pinnedPathSet／frecency／recentResults を含めていないことが重要。これらは
  // ピン止め操作・ファイル起動・/recent の再取得の「副作用」として変化する値で
  // あり、ユーザーが新しい検索文脈に入ったわけではない。もしこれらも依存配列に
  // 含めると、ピン止め操作で pinnedPathSet が変化するたびにこの効果が発火して
  // intent を {type:'top'} へ強制的に巻き戻してしまい、フェーズDと同じ
  // リグレッション（ピン止め直後に選択が先頭へ戻る）が intent 経由で再発する。
  // 「ユーザー起因の文脈変化」と「その文脈変化に伴う副作用としての再取得」を
  // 依存配列のレベルで構造的に分離することで、一発の抑止フラグに頼らずに
  // competing writes の問題そのものを起こらなくしている。
  //
  // issue 0030再実装：通常検索の同一コンテキスト内（specialModeがfalseのまま）で
  // 検索文字列だけが変化した場合は、この汎用トリガーでもリセットしない
  // （外部設計「選択モデル」表2「同一コンテキスト内で検索文字列が変化」を参照。
  // 画面に表示中の選択対象の識別子を保持する）。settingsVersion／appSettings／
  // closeRefreshTickの変化や、specialModeへの出入り（どちらか一方でもtrueなら）は
  // 従来どおり無条件で先頭へリセットする。
  // 依存配列に specialMode 自体は含めない。specialMode は query と appSettings
  // だけから導出される値のため、specialMode が変化しうる場面では query または
  // appSettings も必ず変化しており、この effect は既存の依存項目だけで確実に
  // 再実行される（specialMode を独立した依存として追加する必要がない）。
  const intentResetPrevSpecialModeRef = useRef(specialMode);
  useEffect(() => {
    const wasSpecialMode = intentResetPrevSpecialModeRef.current;
    const suppressReset = !specialMode && !wasSpecialMode;
    if (!suppressReset) {
      updateIntent({ type: "top" }, "query-or-settings-change");
    }
    intentResetPrevSpecialModeRef.current = specialMode;
  }, [query, settingsVersion, appSettings, closeRefreshTick, updateIntent]);

  // 400工程レビュー指摘（issue 0030④）：通常検索の同一コンテキスト内で検索文字列が
  // 変化し、ピン止めブロック等の固定候補が即座に更新されて rows が変化した直後、
  // 直前に完了したファイル検索結果への置換がまだ完了していない一瞬の間に、選択が
  // 保持中の（まだ置換されていない）旧ファイル結果の先頭へ一時的に移動して見える
  // 不具合があった（例：ピン止め行を選択中に検索文字列を入力すると、ピン止め
  // ブロックが消えた瞬間、選択が保持中の直前結果の先頭ファイルへ一瞬移動してから
  // 新しい一覧へ切り替わる）。
  //
  // 原因は、選択解決用 useLayoutEffect（下の selectedFallbackRef を参照する効果）が
  // rows の変化のたびに「識別子が見つからなければ先頭の選択可能項目へ移動する」
  // フォールバックを適用しており、この rows の変化には（a）検索結果の置換完了と
  // （b）固定候補の即時更新の両方が含まれてしまっていたこと。外部設計は（a）の
  // 「最新結果への置換完了時」だけにこの移動を行うと定めている。
  //
  // 検索ディスパッチ本体（searchBusyRef を立てる useEffect）は通常の useEffect で
  // あり、同一コミット内では useLayoutEffect より後に実行されるため、選択解決用
  // useLayoutEffect の初回実行時点では searchBusyRef.current がまだ false のまま
  // （＝検索が実行中であることをまだ検知できない）という React のコミット順序上の
  // 制約がある。そのため、検索ディスパッチとは別に、選択解決用 useLayoutEffect より
  // 前に宣言したこの useLayoutEffect で searchBusyRef を先に立てておく
  // （useLayoutEffect 同士は宣言順に実行されるため、これが選択解決用より確実に
  // 先に走る）。startSearchBusy 自身は既に実行中なら何もしないガードを持つため、
  // 後続の検索ディスパッチ側から再度呼んでも二重にはならない。
  useLayoutEffect(() => {
    if (!specialMode && appSettings.fileSearchEnabled) {
      startSearchBusy();
    }
  }, [query, settingsVersion, appSettings, closeRefreshTick]);

  // R-1 フェーズD-3: /recent（recentMode）専用の「recentResults が変化する
  // たび無条件に intent を top へ戻す」effect は撤去した。これは D-2 の対象
  // 範囲（通常モード＋clipboardMode）に含まれず、旧設計の残骸として見落と
  // されていたもの（詳細は CLAUDE.md「選択状態の維持」節の D-3 を参照）。
  // 00-requirements.md に「フォーカス復帰のたびに選択をリセットする」という
  // 仕様は存在せず、通常のファイル検索・clipboardMode・ピン止めブロックは
  // いずれもフォーカス復帰時に intent を変えず、resolveSelected が同じキーを
  // rows/clipboardSelectionItems 上で探し直すだけで選択を維持している。
  // recentMode もこれらと同じ経路（rows の一部として resolveSelected が
  // 解決する）に統一し、専用の強制リセットは行わない。
  //
  // クエリ変更で recentMode に新規突入する場合の「先頭を選ぶ」動作は、
  // 上の専用トリガーその1（query の変化を検知する effect）がそのまま担う
  // （recentMode への突入・離脱は必ず query の変化を伴うため）。

  // calcMode（数式らしい入力）とファイル検索は排他にせず、両方を独立して実行する。
  // 計算結果は urlConvertResult と同様にファイル検索結果とは別枠の固定表示領域として
  // 共存表示するため（詳細は ResultList を参照）、ここでは setResults([]) による
  // ファイル検索結果のクリアは行わない。
  //
  // 選択（selected）のリセットは、通常モード／clipboardMode／recentMode に
  // ついてはもうここでは行わない（上記の専用トリガー＝query/settings/
  // closeRefreshTick の変化を検知する effect が intent を通じて行うため）。
  // prefixCommandMode／pathPasteWizardMode は intent を使わない旧来の生
  // インデックス書き込みのままなので、そちらのみ引き続きこの effect 内で
  // setSelectedRaw(0) を呼ぶ（詳細は SelectIntent 型のコメントを参照）。
  useEffect(() => {
    // このeffect自身が最後に実行された時点で通常検索コンテキストだったかどうか
    // （specialModeのいずれでもなかったか）を読み取ってから、次回のために更新する。
    // 別モードから通常検索コンテキストへ戻った直後の一度きりのresults消去
    // （下のappSettings.fileSearchEnabled分岐を参照）に使う。
    const wasNormalSearchContext = wasNormalSearchContextRef.current;
    wasNormalSearchContextRef.current = !specialMode;

    if (clipboardMode) {
      setResults([]);
      abandonSearchOnModeExit();
      setCalcResult(null);
      setPathPasteCandidate(null);
      return;
    }
    if (prefixCommandMode) {
      setSelectedRaw(0);
      setResults([]);
      abandonSearchOnModeExit();
      setCalcResult(null);
      setPathPasteCandidate(null);
      return;
    }
    if (pathPasteWizardMode) {
      // ウィザード進行中は pathPasteCandidate（対象パス・名前・isDir）を機能1/機能2の
      // アクションが引き続き参照するため、ここではクリアしない。
      setSelectedRaw(0);
      setResults([]);
      abandonSearchOnModeExit();
      setCalcResult(null);
      return;
    }
    if (recentMode) {
      // recentResults は Rust への非同期往復を経ない同期的な値のため、ここで
      // 無条件に setResults(recentResults) してよい。以前はこの再計算が
      // hideWindow() 解決前に発生してちらつく問題があったが、closeWindow() が
      // hideWindow() を最優先で待ってから初めてクエリを変更する設計に統一された
      // ことで、この useEffect 自体がウィンドウ非表示後にしか再実行されなくなり、
      // 個別のガードは不要になった（詳細は「ウィンドウを閉じる系アクションの共通設計」節）。
      console.debug(`[recent] applying recentResults to results (count=${recentResults.length})`);
      setResults(recentResults);
      abandonSearchOnModeExit();
      setCalcResult(null);
      setPathPasteCandidate(null);
      return;
    }
    if (favoriteMode) {
      // /favorite モードは ResultList の rows を使わず専用コンポーネント
      // （FavoriteListPanel）で favoriteTree を直接描画するため、results は
      // 空にするだけでよい（selected の解決も intent + favoriteSelectionItems の
      // 組み合わせで別途行う。詳細は選択解決用 useLayoutEffect を参照）。
      setResults([]);
      abandonSearchOnModeExit();
      setCalcResult(null);
      setPathPasteCandidate(null);
      return;
    }

    if (appSettings.calcEnabled && isCalcExpression(query)) {
      invoke<string | null>("calculate", { expr: query })
        .then(setCalcResult)
        .catch(console.error);
    } else {
      setCalcResult(null);
    }

    // パス貼り付けによる検索フォルダ管理：検索ボックスの文字列（CF_HDROP からの
    // 流し込み・通常のテキスト貼り付け・手入力のいずれも区別しない）に対して、
    // 実在するファイル/フォルダのパスかどうかを判定する。数式計算・URLエンコード/
    // デコードと同様、ファイル検索結果とは別枠の固定表示領域として共存表示するため、
    // setResults([]) によるファイル検索結果のクリアは行わない。
    if (appSettings.pathPasteEnabled) {
      const callId = beginAsyncCall("pathPaste");
      invoke<PastedPathInfo | null>("judge_pasted_path", { text: query })
        .then((candidate) => {
          if (!isLatestAsyncCall("pathPaste", callId)) return;
          setPathPasteCandidate(candidate);
        })
        .catch(console.error);
    } else {
      setPathPasteCandidate(null);
    }

    if (appSettings.fileSearchEnabled) {
      // 別モードから通常検索コンテキストへ戻った直後（wasNormalSearchContextが
      // false）だけ、保持していた results（別モードの一覧だったかもしれない）を
      // 空にする。最新結果が確定するまでファイル結果を表示しない（外部設計「選択
      // モデル」表2「別のモードから通常検索へ移行」を参照）。通常検索コンテキスト
      // 内に留まったままの検索文字列変更では、直前に完了した結果をそのまま
      // 表示し続ける（setResults([]) を呼ばない）。
      if (!wasNormalSearchContext) {
        setResults([]);
      }
      // ウィンドウを閉じる直前の setQuery("") による変化でもここで呼ぶ。ウィンドウが
      // 非表示になった後（invoke の解決を待つ間、既にユーザーからは見えない）に
      // 完了するため体感上のコストはなく、代わりに次に空クエリのまま再表示した際、
      // 常に最新の frecency 順一覧（通常表示）がすぐ見える状態にできる
      // （かつて「ウィンドウを閉じるだけなら不要な処理」として1回だけ抑止していたが、
      // 抑止した分の再取得を行うタイミングがどこにもなく、次に再表示した時に結果一覧が
      // 空のまま固まって見える不具合になっていたため廃止した。世代 ID
      // （asyncCallIdRef の "search" キー）による使い捨てチェックは維持しているため、
      // 連続してクエリが変わった場合に古い呼び出しの結果が後から上書きしてしまうことはない）。
      const generation = beginAsyncCall("search");
      // ピン止め済みパスの除外は、ピン止めブロックが実際に画面上へ表示されている
      // 場合（pinnedVisible。pinEnabled が OFF の場合や、クエリに文字が入力されている
      // 場合は false になる）のときのみ行う。query === "" だけで判定すると
      // pinEnabled が OFF でも除外がかかり続け、ピン止めしていたファイルが通常の
      // 検索結果からも消えてしまう不具合になっていたため、pinnedVisible を使う
      // （この効果に到達する時点で clipboardMode/recentMode/prefixCommandMode/
      // pathPasteWizardMode はいずれも既に false のため、pinnedVisible は実質的に
      // 「pinEnabled && query === ""」と同値になる）。
      const excludePaths = pinnedVisible ? Array.from(pinnedPathSet) : [];
      console.debug(
        `[search] search_files queued (query="${query}", generation=${generation}, closeRefreshTick=${closeRefreshTick}, excludeCount=${excludePaths.length})`
      );
      // 直前に完了したファイル検索結果は消去せずそのまま表示し続ける（一覧内に
      // 「検索中…」の状態行は追加しない）。実行中のRust側処理へは軽量コマンドで
      // 即座に新しい世代を通知し、実際の invoke 発行はキュー（searchQueueRef）に
      // 積むだけにとどめる。実行中の呼び出しが無ければ直ちに runQueuedSearchRef を
      // 起動する。100ms監視はアイドル状態からの遷移時だけ開始し、既に検索中なら
      // 再起動しない（startSearchBusy内部でガードする）。
      invoke("set_search_generation", { generation }).catch(() => {});
      searchQueueRef.current = { generation, query, excludePaths };
      startSearchBusy();
      if (!searchInFlightRef.current) {
        runQueuedSearchRef.current();
      }
    } else {
      setResults([]);
      endSearchBusy();
    }
  }, [
    query,
    settingsVersion,
    appSettings,
    frecency,
    clipboardMode,
    prefixCommandMode,
    pathPasteWizardMode,
    recentMode,
    recentResults,
    favoriteMode,
    pinnedVisible,
    pinnedPathSet,
    closeRefreshTick,
    beginAsyncCall,
    isLatestAsyncCall,
    specialMode,
    abandonSearchOnModeExit,
    startSearchBusy,
    endSearchBusy,
  ]);

  // 起動回数・最終起動時刻を更新し、settings.json の "frecency" キーへ即時永続化する。
  // frecencyRef は useCallback の古いクロージャに残った state を参照してしまうのを避けるための鏡。
  const recordFrecency = useCallback(async (path: string) => {
    const now = Date.now();
    const existing = frecencyRef.current[path];
    const updated: FrecencyMap = {
      ...frecencyRef.current,
      [path]: { count: (existing?.count ?? 0) + 1, lastUsed: now },
    };
    frecencyRef.current = updated;
    setFrecency(updated);

    const store = storeRef.current;
    if (store) {
      await store.set("frecency", updated);
      await store.save();
    }
  }, []);

  // プレフィックスコマンド候補の使用回数・最終使用時刻を更新し、settings.json の
  // "prefixCommandFrecency" キーへ即時永続化する（ファイル検索の frecency と同じ方式）。
  const recordPrefixCommandFrecency = useCallback(async (keyword: string) => {
    const now = Date.now();
    const existing = prefixCommandFrecencyRef.current[keyword];
    const updated: FrecencyMap = {
      ...prefixCommandFrecencyRef.current,
      [keyword]: { count: (existing?.count ?? 0) + 1, lastUsed: now },
    };
    prefixCommandFrecencyRef.current = updated;
    setPrefixCommandFrecency(updated);

    const store = storeRef.current;
    if (store) {
      await store.set(PREFIX_COMMAND_FRECENCY_KEY, updated);
      await store.save();
    }
  }, []);

  // ピン止めの追加・解除。書き込み頻度が低いため、部分更新ではなく favorites 配列
  // 全量を組み立てて set_favorites に渡す（B-1 の方針）。成功後、Rust から返る
  // 保存済み配列を新しい真実の状態として反映したうえで、アイコン付き表示用一覧
  // （pinnedFiles）を取り直す。
  const togglePin = useCallback(
    (file: FileEntry, onSaved?: () => void) => {
      const current = favoritesRef.current;
      const alreadyPinned = current.some(
        (f) =>
          f.parentId === PINNED_FOLDER_ID &&
          f.type === "file" &&
          f.value === file.path
      );
      let updated: FavoriteNode[];
      if (alreadyPinned) {
        // ピン止め解除：解除後は "file" kind の行として rows に現れる。移動先
        // （通常のファイル検索結果内の何行目に来るか）は frecency ランキング
        // 次第で非同期にしか分からないため、対象の識別子（"file:<path>"）を
        // intent に積むだけにとどめ、rows が再構築されて見つかった時点で
        // 選択が自動的に解決される（intent 解決用 useLayoutEffect を参照）。
        // expiresAt を付けているのは、対象ファイルが検索結果の表示上限
        // （MAX_SEARCH_RESULTS）に入らない等、rows 上に一切現れない可能性が
        // あるため（一定時間で諦めて {type:'top'} にフォールバックする）。
        updateIntent(
          { type: "key", key: `file:${file.path}`, expiresAt: Date.now() + SELECT_INTENT_TIMEOUT_MS },
          "pin-remove"
        );
        updated = current.filter(
          (f) =>
            !(
              f.parentId === PINNED_FOLDER_ID &&
              f.type === "file" &&
              f.value === file.path
            )
        );
      } else {
        // ピン止め：ピン止めブロックが実際に画面へ表示される場合（pinnedVisible。
        // 検索ボックスが空で、clipboardMode・recentMode いずれでもない場合のみ true）
        // のみ、この行は新規ピンとして常にブロック末尾（order 最大）へ追加され、
        // "pinned:<path>" kind の行として rows に現れる。
        // pinnedVisible が false の場合（検索ボックスに文字が入力されている通常の
        // ファイル検索結果、または /recent モードなど）は、ピン止めブロック自体が
        // 表示されないため行は移動せず、これまで通り "file:<path>" kind の行の
        // ままその場に留まる（00-requirements.md「検索ボックスに文字が入力されている
        // ときの表示」「/recent からのピン止め」を参照）。/recent 専用の分岐を
        // 個別に設けず、既存の pinnedVisible をそのまま再利用することで、通常検索・
        // /recent のどちらで「ピン止めブロックが見えない状態でのピン止め」が
        // 起きても同じロジックで正しく選択が維持される。
        // 実際に rows へ反映されるのは set_favorites・fetchPinnedFiles の
        // IPC往復後になるため、selected への直接書き込みは行わず、対象の識別子を
        // intent に積むだけにする（rows が再構築され次第、intent 解決用
        // useLayoutEffect が選択する）。
        const targetKey = pinnedVisible
          ? `pinned:${file.path}`
          : `file:${file.path}`;
        updateIntent(
          { type: "key", key: targetKey, expiresAt: Date.now() + SELECT_INTENT_TIMEOUT_MS },
          "pin-add"
        );
        const pinnedNodes = current.filter(
          (f) => f.parentId === PINNED_FOLDER_ID && f.type === "file"
        );
        const maxOrder = pinnedNodes.reduce(
          (max, f) => Math.max(max, f.order),
          -1
        );
        const newNode: FavoriteNode = {
          id: makeId(),
          parentId: PINNED_FOLDER_ID,
          type: "file",
          name: file.name,
          value: file.path,
          order: maxOrder + 1,
          collapsed: false,
        };
        updated = [...current, newNode];
      }
      invoke<FavoriteNode[]>("set_favorites", { favorites: updated })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          fetchPinnedFiles("toggle-pin");
          onSaved?.();
        })
        .catch(console.error);
    },
    [fetchPinnedFiles, updateIntent, pinnedVisible]
  );

  // パス貼り付け候補は「一操作を選び切って完了する」入口のため、通常行のアイコン操作
  // と異なり、非表示を確定してから既存のトグル処理を開始する。
  const togglePinFromPaste = useCallback(async () => {
    if (!pathPasteCandidate) return;
    const file: FileEntry = {
      path: pathPasteCandidate.path,
      name: pathPasteCandidate.name,
      icon: null,
    };
    const wasPinned = isPinned(file.path);
    await closeWindow({
      cleanup: () => {
        togglePin(file, () => {
          invoke("show_path_paste_toast", {
            message: `${wasPinned ? "ピン止めを解除しました" : "ピン止めしました"}: ${file.name}`,
          }).catch(console.error);
        });
        clearPathPaste();
      },
    });
  }, [pathPasteCandidate, isPinned, closeWindow, togglePin, clearPathPaste]);

  // お気に入りの登録・解除。ピン止め（togglePin）とは異なり、favorites 配列全量を
  // フロントエンドで組み立てて set_favorites に渡す方式ではなく、専用の Rust コマンド
  // （add_favorite/remove_favorite/add_favorite_folder）を呼ぶ（00-requirements.md
  // 「お気に入り機能」節の指示通り、追加・削除をそれぞれ独立したコマンドとして実装
  // したため）。いずれも更新後の favorites 全量を返すので、戻り値をそのまま
  // favoritesRef/favorites の新しい真実として反映する（togglePin と同じ反映方法。
  // favorites は「ピン止め・お気に入り・メモ」共通の単一配列のため、pinnedPathSet
  // 等の再計算にもこのまま波及する）。
  //
  // 登録済みの行のクリック（解除）は確認ダイアログを挟まず即座に行う（段階2①のまま
  // 変更なし）。未登録の行のクリック（登録）は段階2②から登録ダイアログを経由する
  // ように変更した（表示名・保存先フォルダをユーザーが指定できるようにするため）。
  //
  // お気に入りの登録・解除は、ピン止めと異なり行の移動（ブロックへの出入り）を
  // 伴わないため、選択位置は変化しない。intent の更新は不要。
  const [favoriteDialogTarget, setFavoriteDialogTarget] = useState<FileEntry | null>(null);
  // パス貼り付け候補から開いた登録ダイアログだけは、保存後にウィンドウを閉じる。
  const [favoriteDialogFromPathPaste, setFavoriteDialogFromPathPaste] = useState(false);
  // 「前回この操作で使用したフォルダ」の記憶。settings.json への永続化は不要
  // （00-requirements.md「登録ダイアログ」節の指示通り、アプリ内の一時状態でよい）ため
  // useRef で保持するのみ。再レンダリングのトリガーが不要な値のため useState にしない。
  const lastFavoriteFolderIdRef = useRef<string>(FAVORITES_FOLDER_ID);

  // フォルダ削除確認モーダルの表示対象（配下が空でない場合のみセットされる。
  // 空の場合は確認を挟まず即座に削除するため、このstateを経由しない）。
  // お気に入り編集ビューが使う（/favorite ブラウジング側の暫定削除UIは撤去済み）。
  // `onRemoved` に削除確定後の選択状態のリセットを呼び出し元から渡す
  // （詳細は requestDeleteFavoriteFolder のコメントを参照）。
  const [pendingDeleteFavoriteFolder, setPendingDeleteFavoriteFolder] = useState<{
    id: string;
    name: string;
    descendantCount: number;
    onRemoved: () => void;
  } | null>(null);

  // `onRemoved` は解除確定後の選択復元を呼び出し元ごとに切り替えるための
  // コールバック（省略時は /favorite ブラウジングの既定挙動）。
  // requestDeleteFavoriteFolder の onRemoved と同じ設計（詳細はそちらのコメントを
  // 参照）。お気に入り編集ビュー（App.tsx）は自身の選択ドメイン
  // （useFavoriteEditSelection）を復元するコールバックを明示的に渡す。
  const toggleFavorite = useCallback((file: FileEntry, onRemoved?: () => void, onSaved?: () => void) => {
    const current = favoritesRef.current;
    const existing = current.find(
      (f) =>
        f.type === "file" &&
        f.value === file.path &&
        isDescendantOfFolder(current, f.parentId, FAVORITES_FOLDER_ID)
    );
    if (existing) {
      if (onRemoved) {
        onRemoved();
      } else if (favoriteMode) {
        // /favorite モード自身の一覧から★解除した場合、対象行は favoriteTree
        // から消え、行番号のフォールバック（resolveSelected の「見つからなければ
        // 直前のインデックスを維持」）に選択位置の復元を委ねると、識別子ベース
        // ではなく実質的に行番号ベースの復元になってしまう。togglePin の解除
        // 分岐（alreadyPinned 側。「削除後に別の場所へ移動する対象の識別子を
        // intent に積み、rows が再構築されて見つかった時点で自動解決される」
        // というパターン）と同じ経路に統合するため、削除前に次（無ければ前）の
        // アイテム行の識別子を求め、intent をその識別子で更新してから解除を
        // 確定する。通常のファイル検索結果行・/recent の行から★解除した場合
        // （favoriteMode が false）は、行自体が消えずその場に残るため対象外
        // （togglePin が通常行からのピン止めで intent を変更しないのと同じ理由）。
        const removedKey = favoriteItemRowKey(existing.id);
        const currentIndex = favoriteSelectionItems.findIndex(
          (item) => item.key === removedKey
        );
        const neighbor =
          (currentIndex !== -1 ? favoriteSelectionItems[currentIndex + 1] : undefined) ??
          (currentIndex !== -1 ? favoriteSelectionItems[currentIndex - 1] : undefined) ??
          null;
        updateIntent(
          neighbor
            ? {
                type: "key",
                key: neighbor.key,
                expiresAt: Date.now() + SELECT_INTENT_TIMEOUT_MS,
              }
            : { type: "top" },
          "favorite-remove"
        );
      }
      invoke<FavoriteNode[]>("remove_favorite", { id: existing.id })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          // favorites（ピン止め・お気に入り・メモ共通の配列）と rawFavoriteNodes
          // （/favorite モード表示専用のスナップショット）は別々の state のため、
          // favorites 側の更新だけでは /favorite モードの一覧（favoriteTree）に
          // 反映されない。★解除は新規のファイルパスを増やす操作ではなく実体の
          // 有無を再チェックする必要が無いため、追加の非同期往復
          // （fetchFavoriteNodes）を経由せず、返ってきた saved から同期的に
          // 導出する（deriveFavoriteNodesFromFavorites のコメントを参照）。
          setRawFavoriteNodes(deriveFavoriteNodesFromFavorites(saved));
          onSaved?.();
        })
        .catch(console.error);
      return;
    }
    setFavoriteDialogTarget(file);
  }, [favoriteMode, favoriteSelectionItems, updateIntent]);

  const closeFavoriteDialog = useCallback(() => {
    setFavoriteDialogTarget(null);
    setFavoriteDialogFromPathPaste(false);
  }, []);

  const confirmFavoriteDialog = useCallback(
    async (name: string, folderId: string) => {
      const target = favoriteDialogTarget;
      if (!target) return;
      const save = () => {
        invoke<FavoriteNode[]>("add_favorite", { path: target.path, name, folderId })
          .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          lastFavoriteFolderIdRef.current = folderId;
          setFavoriteDialogTarget(null);
          setFavoriteDialogFromPathPaste(false);
          // ここで登録するのは新規のファイルパスであり、実体の有無
          // （favoriteExistence）を check_paths_exist で確認する必要がある
          // （フォルダ作成・リネーム・削除・移動・★解除のようにファイルパスの
          // 集合が変わらない/減るだけの操作とは異なり、saved から同期的に
          // 導出するだけでは足りない）。そのため他の操作とは異なり、
          // fetchFavoriteNodes（get_favorite_nodes → check_paths_exist の
          // 非同期往復）をそのまま使う（deriveFavoriteNodesFromFavorites の
          // コメントを参照）。
          fetchFavoriteNodes("register-dialog");
          if (favoriteDialogFromPathPaste) {
            invoke("show_path_paste_toast", {
              message: `お気に入りに追加しました: ${target.name}`,
            }).catch(console.error);
          }
        })
        .catch(console.error);
      };
      if (favoriteDialogFromPathPaste) {
        await closeWindow({
          cleanup: () => {
            clearPathPaste();
            save();
          },
        });
      } else {
        save();
      }
    },
    [
      favoriteDialogTarget,
      favoriteDialogFromPathPaste,
      closeWindow,
      clearPathPaste,
      fetchFavoriteNodes,
    ]
  );

  const toggleFavoriteFromPaste = useCallback(async () => {
    if (!pathPasteCandidate) return;
    const file: FileEntry = {
      path: pathPasteCandidate.path,
      name: pathPasteCandidate.name,
      icon: null,
    };
    if (!isFavorited(file.path)) {
      setFavoriteDialogFromPathPaste(true);
      setFavoriteDialogTarget(file);
      return;
    }
    await closeWindow({
      cleanup: () => {
        toggleFavorite(file, undefined, () => {
          invoke("show_path_paste_toast", {
            message: `お気に入りから削除しました: ${file.name}`,
          }).catch(console.error);
        });
        clearPathPaste();
      },
    });
  }, [pathPasteCandidate, isFavorited, closeWindow, toggleFavorite, clearPathPaste]);

  // 登録ダイアログの「新規フォルダ作成」から呼ばれる。作成後、呼び出し元（ダイアログ）
  // が戻り値の id を即座に選択状態にできるよう、新規追加されたノードそのものを返す
  // （呼び出し前後の favorites 配列を比較し、新たに増えた1件を特定する。Rust 側が
  // 生成する id はフロントエンドからは事前に分からないため、この差分検出が必要）。
  const createFavoriteFolder = useCallback(
    (parentId: string, name: string): Promise<CreateFolderResult> => {
      const before = favoritesRef.current;
      return invoke<FavoriteNode[]>("add_favorite_folder", {
        name,
        parentId,
      })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          // /favorite モード表示専用のスナップショット（rawFavoriteNodes）も
          // saved から同期的に更新する（deriveFavoriteNodesFromFavorites の
          // コメントを参照）。以前はここで別途 fetchFavoriteNodes（追加の非同期
          // 往復）を呼んでおり、それが解決するまでの間 favoriteTree に新規
          // フォルダが反映されない隙間があった。連続してフォルダを作成する
          // （直前に作成した行を選択してすぐ次を作成する）と、この隙間の間は
          // favoriteTree にまだ新しい行が無いため選択解決が直前の選択に
          // フォールバックし続け、次の作成先の親を取り違える不具合があった
          // （詳細は docs/internal-design/favorites-data-model.md「経緯」節を参照）。
          setRawFavoriteNodes(deriveFavoriteNodesFromFavorites(saved));
          const added = saved.find(
            (f) => !before.some((b) => b.id === f.id)
          );
          return added
            ? { folder: { id: added.id, label: added.name }, error: null }
            : { folder: null, error: "フォルダの作成に失敗しました" };
        })
        .catch((err) => {
          // Rust コマンドが Err(String) を返した場合、tauri の invoke はその
          // 文字列（同名フォルダの重複エラー等）でPromiseをrejectする。
          // 他の set_* 系フックの catch と同じ String(e) でメッセージを取り出し、
          // 呼び出し元（RegisterEntryDialog）がそのまま表示できるようにする
          // （以前は握りつぶして固定文言のみを返しており、重複エラーの具体的な
          // メッセージが利用者に伝わっていなかった）。
          return { folder: null, error: String(err) };
        });
    },
    []
  );

  // フォルダ削除（お気に入り編集ビューが使う。/favorite ブラウジング側の暫定
  // 削除UIは編集ビュー完成に伴い撤去済み）。
  //
  // 実際に Rust コマンドを呼んで削除を確定する内部処理。配下が空で確認不要な即時
  // 削除・確認ダイアログ経由の削除のいずれからも呼ばれる共通処理として1箇所に
  // まとめる。削除確定後の選択状態のリセット（`onRemoved`）は呼び出し元
  // （useFavoriteEditSelection）から明示的に受け取る。
  const performRemoveFavoriteFolder = useCallback(
    (folderId: string, onRemoved: () => void) => {
      invoke<FavoriteNode[]>("remove_favorite_folder", { id: folderId })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          setRawFavoriteNodes(deriveFavoriteNodesFromFavorites(saved));
          onRemoved();
        })
        .catch(console.error);
    },
    []
  );

  // 削除確認が必要かどうかの判定用に、指定フォルダ配下（再帰）に存在するノード数を
  // rawFavoriteNodes から直接数える（表示中のフィルタ・折りたたみ状態には依存しない、
  // 実際に削除される総数を確認する必要があるため）。
  //
  // 呼び出し元（現在はお気に入り編集ビューのみ。/favorite ブラウジング側の暫定
  // 削除UIは撤去済み）が、削除確定後に自身の選択ドメインをどう戻すか（`onRemoved`）
  // を明示的に渡す。
  const requestDeleteFavoriteFolder = useCallback(
    (folderId: string, name: string, onRemoved: () => void) => {
      const descendantCount = rawFavoriteNodes.filter((n) =>
        isDescendantOfFolder(rawFavoriteNodes, n.parentId, folderId)
      ).length;
      if (descendantCount === 0) {
        performRemoveFavoriteFolder(folderId, onRemoved);
        return;
      }
      setPendingDeleteFavoriteFolder({
        id: folderId,
        name,
        descendantCount,
        onRemoved,
      });
    },
    [rawFavoriteNodes, performRemoveFavoriteFolder]
  );

  const cancelDeleteFavoriteFolder = useCallback(() => {
    setPendingDeleteFavoriteFolder(null);
  }, []);

  const confirmDeleteFavoriteFolder = useCallback(() => {
    if (!pendingDeleteFavoriteFolder) return;
    performRemoveFavoriteFolder(
      pendingDeleteFavoriteFolder.id,
      pendingDeleteFavoriteFolder.onRemoved
    );
    setPendingDeleteFavoriteFolder(null);
  }, [pendingDeleteFavoriteFolder, performRemoveFavoriteFolder]);

  // お気に入り編集ビューでのドラッグ&ドロップによる並び替え・再親化（4e）。
  // 移動はノードの識別子（id）を変えないため、編集ビュー側の選択状態
  // （useFavoriteEditSelection）は特別な復元処理なしでそのまま維持される
  // （favoriteTree が再取得された後も同じ key で解決される）。
  // 重複名・循環参照・予約フォルダ保護等のバリデーションは Rust側で行い、失敗時は
  // エラーメッセージ文字列を返す契約に統一する（他の set_* 系フックコールバックと
  // 同じ Promise<string | null> の契約。docs/internal-design/settings-panel-architecture.md
  // 「エラー状態の保持場所」を参照）。
  const moveFavoriteNodeTo = useCallback(
    (id: string, newParentId: string, targetIndex: number): Promise<string | null> => {
      return invoke<FavoriteNode[]>("move_favorite_node_to", {
        id,
        newParentId,
        targetIndex,
      })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          setRawFavoriteNodes(deriveFavoriteNodesFromFavorites(saved));
          return null;
        })
        .catch((err) => String(err));
    },
    []
  );

  // お気に入り編集ビューでのリネーム（4d）。フォルダ・アイテムのどちらの
  // FavoriteNode.name も変更できる（重複チェック・予約フォルダ保護は Rust側
  // rename_favorite_node が行う）。他の set_* 系フックコールバックと同じ
  // 「成功時 null、失敗時エラーメッセージ文字列」の契約に統一する（詳細は
  // docs/internal-design/settings-panel-architecture.md「エラー状態の保持場所」を参照。
  // 呼び出し元（FavoriteEditTree.tsx の RenameInput）がこの戻り値をそのまま
  // ローカルのエラー表示に使う）。
  //
  // リネームはノードの識別子（id）を変更しないため、選択状態（ブラウジング側の
  // intent／編集ビューの useFavoriteEditSelection のいずれも）は特別な復元処理
  // なしでそのまま維持される（削除のような非同期の選択復元ロジックは不要）。
  const renameFavoriteNode = useCallback(
    (id: string, newName: string): Promise<string | null> => {
      return invoke<FavoriteNode[]>("rename_favorite_node", {
        id,
        newName,
      })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          // /favorite モード表示専用のスナップショット（rawFavoriteNodes）も
          // saved から同期的に更新する（deriveFavoriteNodesFromFavorites の
          // コメントを参照）。
          setRawFavoriteNodes(deriveFavoriteNodesFromFavorites(saved));
          return null;
        })
        .catch((err) => String(err));
    },
    []
  );

  // 登録ダイアログの「保存先フォルダ」プルダウンの選択肢。予約フォルダ「お気に入り」
  // 自身（ルート）＋その配下の folder 型ノードをすべてフラット化し、階層はインデント
  // （全角スペース）と「└ 」の接頭辞で表現する（ツリー階層表示ではなくフラットな
  // 一覧で構わない、という 00-requirements.md「登録ダイアログ」節の指示に従う）。
  // 循環参照は現状発生し得ないが、isDescendantOfFolder と同様に探索深さの上限を
  // 設けて防御的に打ち切る。
  const favoriteFolderOptions = useMemo(() => {
    // folder 型ノードのみを対象にすればよいが、グループ化・走査自体は favoriteTree
    // と同じ groupNodesByParent/walkGroupedTree を使う（同じ「同一 parentId の中では
    // order 昇順」という前提に基づく処理を2箇所で別々に実装しない）。
    const folderNodes = favorites.filter((f) => f.type === "folder");
    const byParent = groupNodesByParent(folderNodes);
    const rootNode = favorites.find((f) => f.id === FAVORITES_FOLDER_ID);
    const options: RegisterFolderOption[] = [
      { id: FAVORITES_FOLDER_ID, label: rootNode?.name ?? "お気に入り" },
    ];
    walkGroupedTree(byParent, FAVORITES_FOLDER_ID, (child, depth) => {
      options.push({
        id: child.id,
        // walkGroupedTree は FAVORITES_FOLDER_ID 自身を depth 0 として扱わず、
        // その直下の子から depth 0 で渡してくる（root 自身は上で別途 push 済み）。
        // 以前の実装（appendChildren を depth 1 から開始）と同じインデント幅に
        // なるよう、ここで +1 して従来通り depth 1 開始として扱う。
        label: `${"　".repeat(depth)}└ ${child.name}`,
      });
    });
    return options;
  }, [favorites]);

  // ピン止めブロックのドラッグ&ドロップによる並び替え。ドロップ確定時に order を
  // 振り直した favorites 配列全量を set_favorites へ渡す。表示側（pinnedFiles）は
  // 保存結果を待たず楽観的に並び替えて即座に反映する（体感速度を優先。保存自体は
  // fire-and-forget で発火する）。
  //
  // selected への直接書き込みは行わず、移動した行の識別子（"pinned:<path>"）を
  // intent に積むだけにする。setPinnedFiles(reordered) が同期的に rows を
  // 再構築させるため、intent 解決用 useLayoutEffect がほぼ次のレンダーで
  // 選択を解決する（詳細は CLAUDE.md「選択状態の維持」節を参照）。
  const reorderPinned = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= pinnedFiles.length ||
        toIndex >= pinnedFiles.length
      ) {
        return;
      }

      const reordered = [...pinnedFiles];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      setPinnedFiles(reordered);
      updateIntent(
        { type: "key", key: `pinned:${moved.path}`, expiresAt: Date.now() + SELECT_INTENT_TIMEOUT_MS },
        "reorder"
      );

      const pathOrder = new Map(reordered.map((f, i) => [f.path, i]));
      const updatedFavorites = favoritesRef.current.map((f) => {
        if (
          f.parentId === PINNED_FOLDER_ID &&
          f.type === "file" &&
          pathOrder.has(f.value)
        ) {
          return { ...f, order: pathOrder.get(f.value)! };
        }
        return f;
      });
      invoke<FavoriteNode[]>("set_favorites", { favorites: updatedFavorites })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
        })
        .catch(console.error);
    },
    [pinnedFiles, updateIntent]
  );

  // launch_file / open_containing_folder はいずれもファイルやフォルダを OS の既定
  // アプリ（Explorer 含む）で開く。起動されたアプリの前面表示や起動の遅さに
  // closeWindow() の hideWindow() 呼び出しが引きずられないよう、invoke は
  // await せず発火させるだけに留める（closeWindow() 自体は無関係に即座に
  // hideWindow() を最優先で実行する。詳細は「ウィンドウを閉じる系アクションの
  // 共通設計」節を参照）。

  // issue 0024：recentMode（/recent）からの確定クローズは、他のL1画面（クリップボード
  // 履歴）と同じく次回は通常の検索画面から開始する仕様のため、クエリはプレフィックス
  // 部分を残さず完全にクリアし（closeWindow() の既定 "full"）、加えて L1状態
  // （App.tsx の view）自体も明示的に検索画面へ戻す（resetToSearchView）。query の
  // クリアだけでは view が "recentEdit" のまま残ってしまうため両方が必要
  // （詳細は docs/internal-design/recent-files.md を参照）。
  // favoriteMode（/favorite）は既存の挙動を変更しない：クエリはプレフィックス部分
  // （"/favorite"）のみを残し、view はそのまま維持する（確定後も編集ビューに留まる
  // 従来の仕様のまま）。
  const launchFile = useCallback(
    async (path: string) => {
      invoke("launch_file", { path }).catch(console.error);
      const cleanup = () => {
        setResults([]);
        recordFrecency(path).catch(console.error);
        if (recentMode) resetToSearchView();
      };
      if (favoriteMode) {
        // external-design/01-screen-transitions.md「モード共存・排他一覧」の
        // /favorite の「確定時の処理」：
        // クエリはプレフィックス部分（"/favorite"）のみを残す（続く横断検索
        // フィルタ文字列だけをクリアする）。
        await closeWindow({
          clearQuery: "prefixOnly",
          prefix: PREFIX_CHAR + appSettings.favoriteKeyword,
          cleanup,
        });
      } else {
        await closeWindow({ cleanup });
      }
    },
    [
      closeWindow,
      recordFrecency,
      recentMode,
      resetToSearchView,
      favoriteMode,
      appSettings.favoriteKeyword,
    ]
  );

  // 選択中の項目の格納フォルダをエクスプローラーで開く（Shift+Enter）。通常の
  // launchFile と異なり frecency は記録しない（ファイルを起動したわけではないため）。
  // ウィンドウを閉じる（非表示にする）挙動は launchFile と同じにする。
  // issue 0024：recentMode からの実行時は launchFile と同じく view を明示的に
  // 検索画面へ戻す（favoriteMode 等、他の呼び出し元は従来通り view に触れない）。
  const openContainingFolder = useCallback(
    async (path: string) => {
      invoke("open_containing_folder", { path }).catch(console.error);
      await closeWindow({
        cleanup: () => {
          setResults([]);
          if (recentMode) resetToSearchView();
        },
      });
    },
    [closeWindow, recentMode, resetToSearchView]
  );

  const copyResult = useCallback(
    async (text: string) => {
      const formatted = appSettings.copyWithComma ? formatWithCommas(text) : text;
      invoke("copy_to_clipboard", { text: formatted }).catch(console.error);
      await closeWindow({ cleanup: () => setCalcResult(null) });
    },
    [appSettings.copyWithComma, closeWindow]
  );

  const copyUrlConvertResult = useCallback(
    async (text: string) => {
      invoke("copy_to_clipboard", { text }).catch(console.error);
      await closeWindow();
    },
    [closeWindow]
  );

  const openWebSearch = useCallback(
    async (q: string) => {
      open(`https://www.google.com/search?q=${encodeURIComponent(q)}`).catch(
        console.error
      );
      await closeWindow();
    },
    [closeWindow]
  );

  const requestSystemCommand = useCallback((cmd: SystemCommand) => {
    // 400_テスト・バグ修正：調査用ログ（詳細は src/lib/uiDebugLog.ts を参照）。
    void logUiEvent(`[open] action=${cmd.action}`);
    setPendingCommand(cmd);
  }, []);

  // プレフィックスコマンド候補（システムコマンド／クリップボード履歴）を選択した時点で
  // 直接実行する。システムコマンドの確認モーダル・重複しないキーワード判定など、個別の
  // 発火ロジック自体は変更せず、そのまま呼び出すだけ。使用実績は選択（Enter／クリック）
  // した時点で記録する（システムコマンドは確認モーダルの確定を待たない）。
  const selectPrefixCommand = useCallback(
    (candidate: PrefixCommand) => {
      recordPrefixCommandFrecency(candidate.keyword);
      if (candidate.kind === "system" && candidate.action) {
        requestSystemCommand({
          action: candidate.action,
          label: candidate.description,
        });
      } else if (
        candidate.kind === "clipboard" ||
        candidate.kind === "recent" ||
        candidate.kind === "favorite" ||
        candidate.kind === "memo"
      ) {
        setQuery(candidate.keyword);
      }
    },
    [recordPrefixCommandFrecency, requestSystemCommand]
  );

  const cancelSystemCommand = useCallback(() => {
    // 400_テスト・バグ修正：調査用ログ。
    void logUiEvent("[cancel]");
    setPendingCommand(null);
  }, []);

  // external-design/01-screen-transitions.md「モーダル・ダイアログのキー操作原則」：
  // 確定（Enter）はブラウザ標準のフォーカス経路（Tabで移動したボタン上のEnterで
  // click発火）に委ね、window レベルリスナーに独自の Enter 分岐を設けない。
  // このコールバックは SystemCommandModal の「実行」ボタンの onClick からのみ呼ばれる
  // （旧・window レベルリスナーの独自 Enter 分岐は撤去済み。撤去の経緯・キーの
  // チャタリング／WebView2の入力二重発火による誤実行事故は同ドキュメントを参照）。
  const confirmSystemCommand = useCallback(async () => {
    if (!pendingCommand) return;
    // 400_テスト・バグ修正：調査用ログ。execute_system_command（OS操作）の発火より
    // 前に必ず await し、この呼び出しがあった事実をディスクへfsync済みにしてから
    // 進める（詳細は src/lib/uiDebugLog.ts を参照）。
    await logUiEvent(`[confirm] action=${pendingCommand.action}`);
    invoke("execute_system_command", {
      action: pendingCommand.action,
    }).catch(console.error);
    await closeWindow({ cleanup: () => setPendingCommand(null) });
  }, [pendingCommand, closeWindow]);

  const setInitialFrecency = useCallback((data: FrecencyMap) => {
    frecencyRef.current = data;
    setFrecency(data);
  }, []);

  const setInitialPrefixCommandFrecency = useCallback((data: FrecencyMap) => {
    prefixCommandFrecencyRef.current = data;
    setPrefixCommandFrecency(data);
  }, []);

  // R-1: 通常モード（clipboardMode／pathPasteWizardMode を除く）の結果一覧を1つの
  // フラット配列として計算する。並び順（ピン止めブロック→パス貼り付け候補→
  // 計算結果→URLエンコード/デコード結果→ファイル検索結果）の正本はこの配列
  // 自身であり、`ResultList.tsx` の描画・`App.tsx` の `handleKeyDown`／
  // `StatusFooter`・直後の選択復元用 `useEffect` はいずれもこの `rows`（または
  // その添字・`row.key`）を参照する形に統一済み（詳細は CLAUDE.md「結果行の
  // フラット配列化（R-1）」節を参照）。
  //
  // Web検索行（webSearchVisible）はこの rows に含めない。prefixCommandMode の候補
  // 一覧・この通常モードの一覧の両方に共通して末尾へ追加される横断的な行のため、
  // フェーズEで別途扱う（詳細は CLAUDE.md を参照）。
  const rows = useMemo<ResultRow[]>(() => {
    const list: ResultRow[] = [];

    if (pinnedVisible) {
      for (const file of pinnedFiles) {
        list.push({
          kind: "pinned",
          key: `pinned:${file.path}`,
          file,
          exists: pinnedExistence[file.path] ?? true,
          favorited: isFavorited(file.path),
        });
      }
    }

    if (pathPasteCandidate) {
      list.push({
        kind: "pathPasteShortcut",
        key: "pathPasteShortcut",
        candidate: pathPasteCandidate,
      });
      if (pathPasteCandidate.isDir) {
        list.push({
          kind: "pathPasteAddFolder",
          key: "pathPasteAddFolder",
          candidate: pathPasteCandidate,
        });
      }
      list.push({
        kind: "pathPastePin",
        key: "pathPastePin",
        candidate: pathPasteCandidate,
        pinned: isPinned(pathPasteCandidate.path),
      });
      list.push({
        kind: "pathPasteFavorite",
        key: "pathPasteFavorite",
        candidate: pathPasteCandidate,
        favorited: isFavorited(pathPasteCandidate.path),
      });
    }

    if (calcResult !== null) {
      list.push({ kind: "calc", key: "calc", result: calcResult });
    }

    if (urlConvertResult !== null) {
      list.push({
        kind: "urlConvert",
        key: "urlConvert",
        result: urlConvertResult,
      });
    }

    for (const file of results) {
      list.push({
        kind: "file",
        key: `file:${file.path}`,
        file,
        pinned: isPinned(file.path),
        favorited: isFavorited(file.path),
      });
    }

    return list;
  }, [
    pinnedVisible,
    pinnedFiles,
    pinnedExistence,
    pathPasteCandidate,
    calcResult,
    urlConvertResult,
    results,
    isPinned,
    isFavorited,
  ]);

  // R-1 フェーズD-2: 通常モード（rows）／clipboardMode（clipboardSelectionItems）
  // の選択（selected）を intent から導出し、反映する唯一の箇所。rows は
  // useMemo であり、この効果はそれより後で定義する必要がある（rows を
  // 依存配列・クロージャの両方で参照するため）。
  //
  // useLayoutEffect を使う理由：ピン止め追加・並び替え直後、setPinnedFiles
  // （楽観的反映）や fetchPinnedFiles の完了で rows が更新された瞬間に、
  // ブラウザが描画する前に selected を確定させたい（useEffect だと描画後に
  // 走るため、一瞬だけ古い選択が見えてから正しい選択に切り替わる、という
  // ちらつきが理論上発生しうる）。
  //
  // fallback（見つからない場合に維持する値）は selectedFallbackRef が保持する。
  // 直前にこの効果自身が解決した値を常に書き戻しているため、prefixCommandMode/
  // pathPasteWizardMode の raw な書き込みとは独立している（それらの間は
  // rows/clipboardSelectionItems 自体が空になるため、この効果は実質的に
  // 「今の値をそのまま返す」no-op になる）。
  const selectedFallbackRef = useRef(0);
  useLayoutEffect(() => {
    const items: SelectableItem[] = favoriteMode
      ? favoriteTree
      : clipboardMode
        ? clipboardSelectionItems
        : rows;
    // issue 0030再実装：通常検索（favoriteMode/clipboardMode/recentModeのいずれでも
    // ない、items===rows のケース）に限り、識別子が見つからない場合は「直前の
    // インデックス」ではなく「先頭の選択可能項目（0）」へ移す（外部設計「選択モデル」
    // 表2「識別子が存在しなければ...先頭の選択可能項目へ移す」を参照）。この
    // フォールバック変更は通常検索のファイル結果置換・固定候補の増減にだけ適用し、
    // クリップボード履歴・お気に入り画面・メモ画面・/recentが共有する既存の
    // 「まだ届いていないだけとみなし直前の表示を維持する」フォールバックは変更しない
    // （呼び出し側でfallback値を出し分けるだけで、resolveSelected自体のシグネチャ・
    // 挙動は変えない）。
    //
    // 400工程再調査（issue 0030④、f28d351の修正では解消しなかったため根本原因から
    // 再調査）：
    //
    // 【f28d351時点の誤り】searchBusyRef.current が true の間は「先頭の選択可能項目
    // （0）」ではなく selectedFallbackRef.current（直前に解決した“数値インデックス”）
    // を使うよう変更したが、これは不十分だった。rows はピン止めブロックなど固定候補の
    // 増減で「先頭側の要素が丸ごと増減する」形で変化する（ファイル検索の完了を待たず
    // 即時更新されるため）。この場合、直前のインデックスをそのまま新しい rows に
    // 適用しても、そのインデックス位置には元と無関係な別の行（保持中の旧ファイル
    // 検索結果のどれか）が来るだけで、0を使うのと同様に「無関係な行が一瞬選択される」
    // 見た目になる。数値インデックスは rows の先頭側の増減に対して意味を保たない
    // （identifier一致による検索であれば増減後も同じ行を追跡できるが、fallbackは
    // 一致しなかった場合の値であり、この場合は数値そのものに意味がない）。
    //
    // 【今回の修正】識別子が見つからず、かつ searchBusyRef.current が true（＝直前に
    // 完了したファイル検索結果がまだ画面にholdされたままで、最新結果への置換が未完了）
    // の間は、具体的な行を一切選ばない（-1＝選択なし）。-1は本アプリの選択状態が
    // 既存で許容している値であり、`rows[-1]` は undefined となるため
    // `App.tsx`の`selectedRow = search.rows[search.selected] ?? null`がnullを返し、
    // ResultList.tsx の `isSelected = index === selected` はどの行とも一致しない
    // （ハイライトなし）。Enter確定は`selectedRow`がnullの間は何も実行しない
    // （外部設計「選択可能な項目がなければEnterは何もしない」と整合）。↑↓キーも
    // `Math.min(selected+1, len-1)`/`Math.max(selected-1, 0)`で-1から0へ正しく
    // クランプされる（App.tsx既存ロジック、今回変更なし）。
    // 検索が完了し searchBusyRef.current が false に戻った時点（＝results置換が
    // 確定しrowsが最終形になった時点）で、この効果が rows の変化を検知して再実行され、
    // そこで初めて「先頭の選択可能項目（0）」へのフォールバックを適用する。この結果、
    // 置換完了前に無関係な行が可視的に選択されることがなくなる。
    const normalSearchDomain = !favoriteMode && !clipboardMode && !recentMode;
    const normalSearchFallbackValue = searchBusyRef.current ? -1 : 0;
    const resolved = resolveSelected(
      intent,
      items,
      normalSearchDomain ? normalSearchFallbackValue : selectedFallbackRef.current
    );
    if (intent.type === "key") {
      const found = items.some((item) => item.key === intent.key);
      if (found) {
        const kind = favoriteMode
          ? (items[resolved] as FavoriteTreeRow).kind
          : !clipboardMode
            ? (items[resolved] as ResultRow).kind
            : "clipboard";
        console.debug(
          `[selectIntent] resolved key="${intent.key}" at index=${resolved} (kind=${kind})`
        );
      } else {
        console.debug(
          `[selectIntent] key="${intent.key}" not found (itemsCount=${items.length}). fallback resolved to selected=${resolved} (normalSearchDomain=${normalSearchDomain}, searchBusy=${searchBusyRef.current}).`
        );
      }
    }
    selectedFallbackRef.current = resolved;
    setSelectedRaw(resolved);
  }, [
    intent,
    rows,
    clipboardMode,
    clipboardSelectionItems,
    favoriteMode,
    favoriteTree,
  ]);

  // intent.type === "key" かつ expiresAt が過ぎても対象が見つからない場合、
  // タイムアウトして intent を {type:'top'} に書き換える（これも「intent の
  // 更新」という同じ経路を通す。selected を直接いじる特別なリセット処理は
  // 新設しない）。rows/clipboardSelectionItems/favoriteTree の「最新値」は
  // タイマー発火時に参照する必要があるため ref に鏡写しする（この効果自体の
  // 依存配列に rows/clipboardSelectionItems/favoriteTree を含めると、それらが
  // 変化するたびタイマーの期限が延長されてしまい、「expiresAt の時点で強制的に
  // 諦める」というタイムアウトの意味が失われるため）。
  //
  // 軸1: 従来この分岐に favoriteMode が無く、/favorite モードで発行された
  // expiresAt 付き intent（toggleFavorite の★解除時等）が rowsRef（favoriteMode
  // 中は空）を参照して常に「見つからない」と誤判定し、正しく選択解決された直後
  // でも約1秒後に intent が {type:"top"} へ強制リセットされていた（潜在バグ）。
  // clipboardSelectionItemsRef と同じ鏡写しパターンで favoriteTreeRef を追加し解消する。
  const rowsRef = useRef<ResultRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const clipboardSelectionItemsRef = useRef<SelectableItem[]>([]);
  useEffect(() => {
    clipboardSelectionItemsRef.current = clipboardSelectionItems;
  }, [clipboardSelectionItems]);
  const favoriteTreeRef = useRef<FavoriteTreeRow[]>([]);
  useEffect(() => {
    favoriteTreeRef.current = favoriteTree;
  }, [favoriteTree]);

  useEffect(() => {
    if (intent.type !== "key" || intent.expiresAt === undefined) return;
    const key = intent.key;
    const delay = Math.max(0, intent.expiresAt - Date.now());
    const timer = setTimeout(() => {
      const items = favoriteMode
        ? favoriteTreeRef.current
        : clipboardMode
          ? clipboardSelectionItemsRef.current
          : rowsRef.current;
      const stillMissing = !items.some((item) => item.key === key);
      if (stillMissing) {
        console.debug(
          `[selectIntent] timed out, could not find key="${key}". Falling back to top.`
        );
        updateIntent({ type: "top" }, "timeout");
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [intent, clipboardMode, favoriteMode, updateIntent]);

  // 整合性検証用の一時的なデバッグログ（R-1 フェーズA限定。console.debug は本番ビルドで
  // Terser により自動削除される）。rows.length が、既存のオフセット計算（App.tsx の
  // baseLength のうち通常モード分の算出式）と同じ式で求めた期待値と常に一致しているかを
  // 実行時に確認する。フェーズB以降で rows への移行が完了したら、このチェック自体
  // 不要になるため削除してよい。
  useEffect(() => {
    const expectedLength =
      (pinnedVisible ? pinnedFiles.length : 0) +
      (pathPasteCandidate ? (pathPasteCandidate.isDir ? 4 : 3) : 0) +
      (calcResult !== null ? 1 : 0) +
      (urlConvertResult !== null ? 1 : 0) +
      results.length;
    if (rows.length !== expectedLength) {
      console.debug(
        `[rows] length mismatch: rows.length=${rows.length}, expected=${expectedLength} ` +
          `(pinnedVisible=${pinnedVisible}, pinnedFiles=${pinnedFiles.length}, ` +
          `pathPasteCandidate=${pathPasteCandidate !== null}, calcResult=${calcResult !== null}, ` +
          `urlConvertResult=${urlConvertResult !== null}, results=${results.length})`
      );
    } else {
      console.debug(
        `[rows] length OK: ${rows.length} rows (kinds: ${rows
          .map((r) => r.kind)
          .join(",")})`
      );
    }
  }, [rows, pinnedVisible, pinnedFiles, pathPasteCandidate, calcResult, urlConvertResult, results]);

  // 検索ビュー上でSearchBoxをふさぐ/disabledにするオーバーレイstateの一覧。
  // App.tsx側の「検索ボックス再フォーカスeffect」「SearchBoxのdisabled判定」
  // 「handleKeyDownの早期return」の3箇所は、いずれも「これらのうちどれか1つでも
  // 開いているか」だけを見ればよく、個別に4state列挙する必要がない。新しい
  // オーバーレイstateを追加する場合はこの配列に追記するだけで、上記3箇所は
  // 自動的に追従する（window レベルのkeydownリスナーだけはオーバーレイごとに
  // Enter/Escapeの意味が異なるため個別分岐が必要で、この値だけでは代替できない。
  // 詳細は docs/internal-design/window-lifecycle.md「検索ビュー上のオーバーレイstate一覧の
  // 単一化（searchOverlayActive）」節を参照）。
  const searchOverlayActive = [
    favoriteDialogTarget,
    pendingCommand,
    pendingDeleteFavoriteFolder,
    pathPasteWizardMode,
  ].some(Boolean);

  return {
    query,
    setQuery,
    results,
    searchSpinnerVisible,
    selected,
    setSelected,
    selectFromHover,
    selectRowByKeyboard,
    searchOverlayActive,
    selectRowFromHover,
    syncClipboardSelectionItems: setClipboardSelectionItems,
    recordMouseMove,
    calcResult,
    prefixCommandCandidates,
    prefixCommandMode,
    selectPrefixCommand,
    clipboardFilterText,
    clipboardMode,
    clipboardEditFilterText,
    setClipboardEditFilterText,
    recentMode,
    recentEditFilterText,
    setRecentEditFilterText,
    urlConvertResult,
    pendingCommand,
    requestSystemCommand,
    cancelSystemCommand,
    confirmSystemCommand,
    launchFile,
    openContainingFolder,
    copyResult,
    copyUrlConvertResult,
    openWebSearch,
    closeWindow,
    setInitialFrecency,
    setInitialPrefixCommandFrecency,
    pathPasteCandidate,
    detectPastedPath,
    addSearchFolderFromPaste,
    pathPasteWizardMode,
    wizardStep,
    wizardFolders,
    wizardName,
    setWizardName,
    startShortcutWizard,
    selectWizardFolder,
    confirmShortcut,
    wizardBack,
    pinnedVisible,
    pinnedFiles,
    pinnedExistence,
    isPinned,
    togglePin,
    togglePinFromPaste,
    reorderPinned,
    isFavorited,
    toggleFavorite,
    toggleFavoriteFromPaste,
    favoriteDialogTarget,
    closeFavoriteDialog,
    confirmFavoriteDialog,
    createFavoriteFolder,
    favoriteFolderOptions,
    lastFavoriteFolderId: lastFavoriteFolderIdRef.current,
    favoriteMode,
    favoriteTree,
    toggleFavoriteFolderCollapsed,
    favoriteEditFilterText,
    setFavoriteEditFilterText,
    favoriteEditRawTree,
    toggleFavoriteFolderCollapsedInEdit,
    pendingDeleteFavoriteFolder,
    requestDeleteFavoriteFolder,
    cancelDeleteFavoriteFolder,
    confirmDeleteFavoriteFolder,
    moveFavoriteNodeTo,
    renameFavoriteNode,
    rows,
  };
}
