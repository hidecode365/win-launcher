import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-shell";
import type { Store } from "@tauri-apps/plugin-store";
import { hideWindow } from "../lib/window";
import { formatWithCommas } from "../lib/format";
import {
  AppSettings,
  FileEntry,
  FrecencyMap,
  PrefixCommand,
  RecentFile,
  SystemCommand,
  UrlConvertResult,
} from "../types";

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
  // copyUrlConvertResult/openWebSearch/confirmSystemCommand/selectClipboardEntry）が
  // 共通して経由する関数。設計原則・過去の経緯の詳細は「ウィンドウを閉じる系アクションの
  // 共通設計」節を参照。要点のみ記す：
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

  const calcMode = appSettings.calcEnabled && isCalcExpression(query);
  const clipboardFilterText = appSettings.clipboardEnabled
    ? clipboardModeFilter(query, appSettings.clipboardPrefix)
    : null;
  const clipboardMode = clipboardFilterText !== null;
  const recentFilterText = appSettings.recentFilesEnabled
    ? recentModeFilter(query, appSettings.recentKeyword)
    : null;
  const recentMode = recentFilterText !== null;

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
  // 入力済み）が有効な間は、候補一覧ではなくそれぞれの専用モードを優先する。
  const prefixCommandCandidates = useMemo(
    () =>
      calcMode || clipboardMode || recentMode
        ? []
        : sortPrefixCommandsByFrecency(
            buildPrefixCommandCandidates(query, appSettings),
            prefixCommandFrecency
          ),
    [calcMode, clipboardMode, recentMode, query, appSettings, prefixCommandFrecency]
  );
  const prefixCommandMode = prefixCommandCandidates.length > 0;

  // URLエンコード/デコード結果はファイル検索結果を置き換えず、その先頭付近に共存表示する
  // （prefixCommandMode/clipboardMode/recentMode のような排他モードにはしない）。
  // calcMode（数式らしい入力）は isCalcExpression の許容文字クラスが数字・演算子・括弧・
  // 空白・小数点のみでレターを含まないため、`http(s)://` から始まる URL 的な入力とは
  // 構造上同時に true にならない。よってここで calcMode を明示的に除外しなくても
  // urlConvertResult と calcResult が同時に発生することはない。
  const urlConvertResult = useMemo(() => {
    if (!appSettings.urlConvertEnabled) return null;
    if (prefixCommandMode || clipboardMode || recentMode) return null;
    return detectUrlConvertResult(query, appSettings.urlConvertKeepSpaceEncoded);
  }, [
    appSettings.urlConvertEnabled,
    appSettings.urlConvertKeepSpaceEncoded,
    prefixCommandMode,
    clipboardMode,
    recentMode,
    query,
  ]);

  // calcMode（数式らしい入力）とファイル検索は排他にせず、両方を独立して実行する。
  // 計算結果は urlConvertResult と同様にファイル検索結果とは別枠の固定表示領域として
  // 共存表示するため（詳細は ResultList を参照）、ここでは setResults([]) による
  // ファイル検索結果のクリアは行わない。
  useEffect(() => {
    if (clipboardMode) {
      setSelectedRaw(0);
      setResults([]);
      setCalcResult(null);
      return;
    }
    if (prefixCommandMode) {
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
      setSelectedRaw(0);
      setResults(recentResults);
      setCalcResult(null);
      return;
    }

    setSelectedRaw(0);

    if (appSettings.calcEnabled && isCalcExpression(query)) {
      invoke<string | null>("calculate", { expr: query })
        .then(setCalcResult)
        .catch(console.error);
    } else {
      setCalcResult(null);
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
      console.debug(
        `[search] search_files start (query="${query}", callId=${callId}, closeRefreshTick=${closeRefreshTick})`
      );
      invoke<FileEntry[]>("search_files", { query })
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
          setSelectedRaw(0);
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
    recentMode,
    recentResults,
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

  return {
    query,
    setQuery,
    results,
    selected,
    setSelected,
    selectFromHover,
    recordMouseMove,
    calcResult,
    prefixCommandCandidates,
    prefixCommandMode,
    selectPrefixCommand,
    clipboardFilterText,
    clipboardMode,
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
  };
}
