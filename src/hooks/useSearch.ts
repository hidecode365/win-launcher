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
import { formatWithCommas, makeId } from "../lib/format";
import {
  AppSettings,
  FavoriteNode,
  FileEntry,
  FolderEntry,
  FrecencyMap,
  PastedPathInfo,
  PINNED_FOLDER_ID,
  PrefixCommand,
  RecentFile,
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

// クエリが "/" + 呼び出しキーワードに前方一致する場合、続く文字列（履歴のテキストフィルタ）
// を返す。一致しない場合は null（モード非アクティブ）。
function clipboardModeFilter(
  query: string,
  clipboardPrefix: string
): string | null {
  const full = PREFIX_CHAR + clipboardPrefix;
  if (!query.toLowerCase().startsWith(full.toLowerCase())) return null;
  return query.slice(full.length).trim();
}

// クエリが "/" + 呼び出しキーワードに前方一致する場合、続く文字列（最近使ったファイル
// 一覧のファイル名フィルタ）を返す。判定方式は clipboardModeFilter と同じ。
function recentModeFilter(query: string, recentKeyword: string): string | null {
  const full = PREFIX_CHAR + recentKeyword;
  if (!query.toLowerCase().startsWith(full.toLowerCase())) return null;
  return query.slice(full.length).trim();
}

const PREFIX_COMMAND_FRECENCY_KEY = "prefixCommandFrecency";

// クエリが "/" から始まる場合、登録済みの全プレフィックスコマンド（システムコマンド3つ＋
// クリップボード履歴。それぞれのキーワード判定ロジック自体は matchSystemCommands /
// clipboardModeFilter と変えず、ここでは「候補として並べて表示する」ための一覧を
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
type SelectIntent =
  | { type: "top" }
  | { type: "key"; key: string; expiresAt?: number };

// resolveSelected が受け取る「選択対象になりうる一覧」の共通形。ResultRow も
// クリップボードエントリから変換したオブジェクトも、この形さえ満たせば対象にできる。
interface SelectableItem {
  key: string;
}

// 純粋関数：intent と現在の行一覧から選択インデックスを導出する。
// - intent.type === "top" のときは常に 0
// - intent.type === "key" のとき、items 内に一致する key があればそのインデックス。
//   無ければ fallback（＝直前に導出できた選択インデックス）をそのまま返す
//   （「見つからない」は「1行目へリセットする理由」ではなく「今探している対象が
//   まだ rows に反映されていないだけ」を意味するため、見つかるかタイムアウトする
//   まで現在の表示をそのまま維持する）
function resolveSelected(
  intent: SelectIntent,
  items: SelectableItem[],
  fallback: number
): number {
  if (intent.type === "top") return 0;
  const index = items.findIndex((item) => item.key === intent.key);
  return index === -1 ? fallback : index;
}

// 復元待ち（intent.type === "key" かつ expiresAt 付き）が一定時間 rows/
// clipboardSelectionItems 上で解決しない場合にあきらめるまでの猶予（ms）。
const SELECT_INTENT_TIMEOUT_MS = 1000;

export function useSearch(
  appSettings: AppSettings,
  settingsVersion: number,
  storeRef: MutableRefObject<Store | null>
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
  // ファイル検索と排他になる（詳細は REQUIREMENTS.md「パス貼り付けによる検索フォルダ管理」節）。
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
  // 詳細は REQUIREMENTS.md「パス貼り付けによる検索フォルダ管理」節の
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

  // 機能1: 検索フォルダとして追加。invoke は closeWindow() の hideWindow() を待たず
  // fire-and-forget で発火する（詳細は「ウィンドウを閉じる系アクションの共通設計」節）。
  const addSearchFolderFromPaste = useCallback(async () => {
    if (!pathPasteCandidate) return;
    invoke("add_search_folder_from_paste", {
      path: pathPasteCandidate.path,
    }).catch(console.error);
    await closeWindow({ cleanup: clearPathPaste });
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

  // 機能2 ステップ3: 保存を実行する。`.lnk` の作成自体（連番付与含む）は Rust 側が行う。
  const confirmShortcut = useCallback(async () => {
    if (!pathPasteCandidate || !wizardSelectedFolder) return;
    invoke("create_shortcut", {
      targetPath: pathPasteCandidate.path,
      folderPath: wizardSelectedFolder.path,
      name: wizardName,
    }).catch(console.error);
    await closeWindow({ cleanup: clearPathPaste });
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
  const clipboardFilterText = appSettings.clipboardEnabled
    ? clipboardModeFilter(query, appSettings.clipboardPrefix)
    : null;
  const clipboardMode = clipboardFilterText !== null;
  const recentFilterText = appSettings.recentFilesEnabled
    ? recentModeFilter(query, appSettings.recentKeyword)
    : null;
  const recentMode = recentFilterText !== null;

  // ピン止めブロックの表示条件（検索ボックスが空、機能ON、他の排他モードでない）。
  // calcMode/prefixCommandMode は入力文字種上クエリが空の間は構造的に成立しない
  // （isCalcExpression は空文字を false、buildPrefixCommandCandidates は "/" で
  // 始まらないクエリを [] にする）ため、ここで明示的に除外する必要はない。
  const pinnedVisible =
    appSettings.pinEnabled && query === "" && !clipboardMode && !recentMode;

  // ピン止め・お気に入り・メモの生ノード配列（隣接リスト方式。詳細は
  // REQUIREMENTS.md/CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
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
  // （"pinned" キー）で保護する。存在確認のタイミングは REQUIREMENTS.md
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
    return filtered.map((f) => ({ name: f.name, path: f.path, icon: null }));
  }, [recentMode, recentFilterText, rawRecentFiles]);

  // クリップボード履歴モード・最近使ったファイル一覧モード（完全な呼び出しキーワードが
  // 入力済み）・パス貼り付けのショートカット配置ウィザード進行中が有効な間は、
  // 候補一覧ではなくそれぞれの専用モードを優先する。
  const prefixCommandCandidates = useMemo(
    () =>
      calcMode || clipboardMode || recentMode || pathPasteWizardMode
        ? []
        : sortPrefixCommandsByFrecency(
            buildPrefixCommandCandidates(query, appSettings),
            prefixCommandFrecency
          ),
    [
      calcMode,
      clipboardMode,
      recentMode,
      pathPasteWizardMode,
      query,
      appSettings,
      prefixCommandFrecency,
    ]
  );
  const prefixCommandMode = prefixCommandCandidates.length > 0;

  // URLエンコード/デコード結果はファイル検索結果を置き換えず、その先頭付近に共存表示する
  // （prefixCommandMode/clipboardMode/recentMode/pathPasteWizardMode のような
  // 排他モードにはしない）。calcMode（数式らしい入力）は isCalcExpression の許容
  // 文字クラスが数字・演算子・括弧・空白・小数点のみでレターを含まないため、
  // `http(s)://` から始まる URL 的な入力とは構造上同時に true にならない。よってここで
  // calcMode を明示的に除外しなくても urlConvertResult と calcResult が同時に
  // 発生することはない。
  const urlConvertResult = useMemo(() => {
    if (!appSettings.urlConvertEnabled) return null;
    if (prefixCommandMode || clipboardMode || recentMode || pathPasteWizardMode) {
      return null;
    }
    return detectUrlConvertResult(query, appSettings.urlConvertKeepSpaceEncoded);
  }, [
    appSettings.urlConvertEnabled,
    appSettings.urlConvertKeepSpaceEncoded,
    prefixCommandMode,
    clipboardMode,
    recentMode,
    pathPasteWizardMode,
    query,
  ]);

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
  useEffect(() => {
    updateIntent({ type: "top" }, "query-or-settings-change");
  }, [query, settingsVersion, appSettings, closeRefreshTick, updateIntent]);

  // R-1 フェーズD-3: /recent（recentMode）専用の「recentResults が変化する
  // たび無条件に intent を top へ戻す」effect は撤去した。これは D-2 の対象
  // 範囲（通常モード＋clipboardMode）に含まれず、旧設計の残骸として見落と
  // されていたもの（詳細は CLAUDE.md「選択状態の維持」節の D-3 を参照）。
  // REQUIREMENTS.md に「フォーカス復帰のたびに選択をリセットする」という
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
    if (clipboardMode) {
      setResults([]);
      setCalcResult(null);
      setPathPasteCandidate(null);
      return;
    }
    if (prefixCommandMode) {
      setSelectedRaw(0);
      setResults([]);
      setCalcResult(null);
      setPathPasteCandidate(null);
      return;
    }
    if (pathPasteWizardMode) {
      // ウィザード進行中は pathPasteCandidate（対象パス・名前・isDir）を機能1/機能2の
      // アクションが引き続き参照するため、ここではクリアしない。
      setSelectedRaw(0);
      setResults([]);
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
      // ウィンドウを閉じる直前の setQuery("") による変化でもここで呼ぶ。ウィンドウが
      // 非表示になった後（invoke の解決を待つ間、既にユーザーからは見えない）に
      // 完了するため体感上のコストはなく、代わりに次に空クエリのまま再表示した際、
      // 常に最新の frecency 順一覧（通常表示）がすぐ見える状態にできる
      // （かつて「ウィンドウを閉じるだけなら不要な処理」として1回だけ抑止していたが、
      // 抑止した分の再取得を行うタイミングがどこにもなく、次に再表示した時に結果一覧が
      // 空のまま固まって見える不具合になっていたため廃止した。世代 ID
      // （asyncCallIdRef の "search" キー）による使い捨てチェックは維持しているため、
      // 連続してクエリが変わった場合に古い呼び出しの結果が後から上書きしてしまうことはない）。
      const callId = beginAsyncCall("search");
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
        `[search] search_files start (query="${query}", callId=${callId}, closeRefreshTick=${closeRefreshTick}, excludeCount=${excludePaths.length})`
      );
      invoke<FileEntry[]>("search_files", { query, excludePaths })
        .then((files) => {
          if (!isLatestAsyncCall("search", callId)) {
            console.debug(
              `[search] search_files discarded (callId=${callId}, current=${asyncCallIdRef.current["search"]})`
            );
            return; // 古い呼び出しの結果は破棄する
          }
          console.debug(
            `[search] search_files resolved (callId=${callId}, count=${files.length})`
          );
          setResults(sortByFrecency(files, frecency));
          // 選択（selected）はここでは一切触らない。通常モードでは results の
          // 変化を検知した rows の再構築 → intent 解決用 useLayoutEffect が
          // 選択を再計算するため、search_files の解決自体が選択に直接
          // 書き込む必要はない（詳細は SelectIntent 型のコメントを参照）。
        })
        .catch(console.error);
    } else {
      setResults([]);
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
    pinnedVisible,
    pinnedPathSet,
    closeRefreshTick,
    beginAsyncCall,
    isLatestAsyncCall,
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
    (file: FileEntry) => {
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
        // ピン止め：新規ピンは常にピン止めブロックの末尾（order 最大）に追加
        // される実装のため、移動先の行番号は追加前の件数として確定的に分かるが、
        // 実際に rows へ反映されるのは set_favorites・fetchPinnedFiles の
        // IPC往復後になる。selected への直接書き込みは行わず、対象の識別子
        // （"pinned:<path>"）を intent に積むだけにする（rows が再構築され
        // 次第、intent 解決用 useLayoutEffect が選択する）。
        updateIntent(
          { type: "key", key: `pinned:${file.path}`, expiresAt: Date.now() + SELECT_INTENT_TIMEOUT_MS },
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
        };
        updated = [...current, newNode];
      }
      invoke<FavoriteNode[]>("set_favorites", { favorites: updated })
        .then((saved) => {
          favoritesRef.current = saved;
          setFavoritesState(saved);
          fetchPinnedFiles("toggle-pin");
        })
        .catch(console.error);
    },
    [fetchPinnedFiles, updateIntent]
  );

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

  // recentMode（/recent）から起動された場合のみ、クエリをプレフィックス部分
  // （"/" + 現在の呼び出しキーワード）まで残す。通常のファイル検索結果からの起動は
  // 従来通り closeWindow() の既定（"full"）でクエリを完全にクリアする。
  const launchFile = useCallback(
    async (path: string) => {
      invoke("launch_file", { path }).catch(console.error);
      const cleanup = () => {
        setResults([]);
        recordFrecency(path).catch(console.error);
      };
      if (recentMode) {
        await closeWindow({
          clearQuery: "prefixOnly",
          prefix: PREFIX_CHAR + appSettings.recentKeyword,
          cleanup,
        });
      } else {
        await closeWindow({ cleanup });
      }
    },
    [closeWindow, recordFrecency, recentMode, appSettings.recentKeyword]
  );

  // 選択中の項目の格納フォルダをエクスプローラーで開く（Shift+Enter）。通常の
  // launchFile と異なり frecency は記録しない（ファイルを起動したわけではないため）。
  // ウィンドウを閉じる（非表示にする）挙動は launchFile と同じにする。
  const openContainingFolder = useCallback(
    async (path: string) => {
      invoke("open_containing_folder", { path }).catch(console.error);
      await closeWindow({ cleanup: () => setResults([]) });
    },
    [closeWindow]
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
      } else if (candidate.kind === "clipboard" || candidate.kind === "recent") {
        setQuery(candidate.keyword);
      }
    },
    [recordPrefixCommandFrecency, requestSystemCommand]
  );

  const cancelSystemCommand = useCallback(() => {
    setPendingCommand(null);
  }, []);

  const confirmSystemCommand = useCallback(async () => {
    if (!pendingCommand) return;
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
    const items: SelectableItem[] = clipboardMode ? clipboardSelectionItems : rows;
    const resolved = resolveSelected(intent, items, selectedFallbackRef.current);
    if (intent.type === "key") {
      const found = items.some((item) => item.key === intent.key);
      if (found) {
        const kind = !clipboardMode ? (items[resolved] as ResultRow).kind : "clipboard";
        console.debug(
          `[selectIntent] resolved key="${intent.key}" at index=${resolved} (kind=${kind})`
        );
      } else {
        console.debug(
          `[selectIntent] key="${intent.key}" not found (itemsCount=${items.length}). Keeping selected=${resolved}.`
        );
      }
    }
    selectedFallbackRef.current = resolved;
    setSelectedRaw(resolved);
  }, [intent, rows, clipboardMode, clipboardSelectionItems]);

  // intent.type === "key" かつ expiresAt が過ぎても対象が見つからない場合、
  // タイムアウトして intent を {type:'top'} に書き換える（これも「intent の
  // 更新」という同じ経路を通す。selected を直接いじる特別なリセット処理は
  // 新設しない）。rows/clipboardSelectionItems の「最新値」はタイマー発火時に
  // 参照する必要があるため ref に鏡写しする（この効果自体の依存配列に
  // rows/clipboardSelectionItems を含めると、それらが変化するたびタイマーの
  // 期限が延長されてしまい、「expiresAt の時点で強制的に諦める」という
  // タイムアウトの意味が失われるため）。
  const rowsRef = useRef<ResultRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const clipboardSelectionItemsRef = useRef<SelectableItem[]>([]);
  useEffect(() => {
    clipboardSelectionItemsRef.current = clipboardSelectionItems;
  }, [clipboardSelectionItems]);

  useEffect(() => {
    if (intent.type !== "key" || intent.expiresAt === undefined) return;
    const key = intent.key;
    const delay = Math.max(0, intent.expiresAt - Date.now());
    const timer = setTimeout(() => {
      const items = clipboardMode ? clipboardSelectionItemsRef.current : rowsRef.current;
      const stillMissing = !items.some((item) => item.key === key);
      if (stillMissing) {
        console.debug(
          `[selectIntent] timed out, could not find key="${key}". Falling back to top.`
        );
        updateIntent({ type: "top" }, "timeout");
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [intent, clipboardMode, updateIntent]);

  // 整合性検証用の一時的なデバッグログ（R-1 フェーズA限定。console.debug は本番ビルドで
  // Terser により自動削除される）。rows.length が、既存のオフセット計算（App.tsx の
  // baseLength のうち通常モード分の算出式）と同じ式で求めた期待値と常に一致しているかを
  // 実行時に確認する。フェーズB以降で rows への移行が完了したら、このチェック自体
  // 不要になるため削除してよい。
  useEffect(() => {
    const expectedLength =
      (pinnedVisible ? pinnedFiles.length : 0) +
      (pathPasteCandidate ? (pathPasteCandidate.isDir ? 2 : 1) : 0) +
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

  return {
    query,
    setQuery,
    results,
    selected,
    setSelected,
    selectFromHover,
    selectRowByKeyboard,
    selectRowFromHover,
    syncClipboardSelectionItems: setClipboardSelectionItems,
    recordMouseMove,
    calcResult,
    prefixCommandCandidates,
    prefixCommandMode,
    selectPrefixCommand,
    clipboardFilterText,
    clipboardMode,
    recentMode,
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
    reorderPinned,
    rows,
  };
}
