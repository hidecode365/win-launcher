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
const PREFIX_CHAR = "/";

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
  const [rawRecentFiles, setRawRecentFiles] = useState<RecentFile[]>([]);

  // search_files・get_recent_files の非同期呼び出しに世代 ID を振り、.then() 発火時点で
  // 自分が最新の呼び出しかどうかを確認してから setResults 等を反映する。呼び出し後に
  // クエリやモードが変わっていた場合（古い呼び出しが後から発火した場合）は結果を破棄し、
  // 現在アクティブなモードの状態を横から上書きしないようにする。
  const asyncCallIdRef = useRef(0);

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
    const callId = ++asyncCallIdRef.current;
    console.debug(`[recent] fetch start (source=${source}, callId=${callId})`);
    invoke<RecentFile[]>("get_recent_files")
      .then((files) => {
        if (asyncCallIdRef.current !== callId) {
          console.debug(
            `[recent] fetch discarded (source=${source}, callId=${callId}, current=${asyncCallIdRef.current})`
          );
          return; // 古い呼び出しの結果は破棄する
        }
        console.debug(`[recent] fetch resolved (source=${source}, count=${files.length})`);
        setRawRecentFiles(files);
      })
      .catch((err) => {
        console.error(`[recent] fetch failed (source=${source}):`, err);
      });
  }, []);

  // 最近使ったファイル一覧モードに入ったタイミング（false → true の遷移）で取得する。
  // フィルタ文字列の変更ごとには再取得せず、既に取得済みの一覧をフロントエンド側で
  // フィルタするだけにする。
  useEffect(() => {
    if (!recentMode) return;
    fetchRecentFiles("mode-enter");
  }, [recentMode, fetchRecentFiles]);

  // recentMode を維持したままウィンドウを非表示にして再度フォーカスを取り戻した場合
  // （ファイルを起動せずに Esc やフォーカスアウトで閉じた場合）も取得し直す。
  // クリップボード履歴は OS のクリップボード変更通知を常時受信しているため
  // 表示中の内容が非表示中も自動で最新化されるが、最近使ったファイル一覧には
  // そのようなプッシュ通知がなく、モード遷移時の1回きりの取得のままだと
  // 非表示中に発生した変化（ファイルを開く／削除する等）は次にモードへ入り直すまで
  // 反映されない。同じ「再表示時には常に最新の状態を見せる」という体験をクリップボード
  // 履歴と揃えるため、フォーカス回復のたびに recentMode が有効なら取得し直す。
  const recentModeRef = useRef(recentMode);
  useEffect(() => {
    recentModeRef.current = recentMode;
  }, [recentMode]);
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
        console.debug(
          `[recent] focus-changed (focused=${focused}, recentMode=${recentModeRef.current})`
        );
        if (focused && recentModeRef.current) {
          fetchRecentFiles("focus-regain");
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
  }, [fetchRecentFiles]);

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
      // （asyncCallIdRef）による使い捨てチェックは維持しているため、連続してクエリが
      // 変わった場合に古い呼び出しの結果が後から上書きしてしまうことはない）。
      const callId = ++asyncCallIdRef.current;
      invoke<FileEntry[]>("search_files", { query })
        .then((files) => {
          if (asyncCallIdRef.current !== callId) return; // 古い呼び出しの結果は破棄する
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

  const launchFile = useCallback(
    async (path: string) => {
      await invoke("launch_file", { path }).catch(console.error);
      await recordFrecency(path);
      setQuery("");
      setResults([]);
      await hideWindow();
    },
    [recordFrecency]
  );

  const copyResult = useCallback(
    async (text: string) => {
      const formatted = appSettings.copyWithComma ? formatWithCommas(text) : text;
      await invoke("copy_to_clipboard", { text: formatted }).catch(console.error);
      setQuery("");
      setCalcResult(null);
      await hideWindow();
    },
    [appSettings.copyWithComma]
  );

  const copyUrlConvertResult = useCallback(async (text: string) => {
    await invoke("copy_to_clipboard", { text }).catch(console.error);
    setQuery("");
    await hideWindow();
  }, []);

  const openWebSearch = useCallback(async (q: string) => {
    await open(
      `https://www.google.com/search?q=${encodeURIComponent(q)}`
    ).catch(console.error);
    setQuery("");
    await hideWindow();
  }, []);

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
    await invoke("execute_system_command", {
      action: pendingCommand.action,
    }).catch(console.error);
    setPendingCommand(null);
    setQuery("");
    await hideWindow();
  }, [pendingCommand]);

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
    copyResult,
    copyUrlConvertResult,
    openWebSearch,
    setInitialFrecency,
    setInitialPrefixCommandFrecency,
  };
}
