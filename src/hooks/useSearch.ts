import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import type { Store } from "@tauri-apps/plugin-store";
import { hideWindow } from "../lib/window";
import { formatWithCommas } from "../lib/format";
import {
  AppSettings,
  FileEntry,
  FrecencyMap,
  SystemCommand,
  UrlConvertResult,
} from "../types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

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

// クエリ全体が数字・演算子・空白・小数点のみで構成される場合のみ計算式とみなす。
// 単に `/` や数字が含まれるだけで計算式と誤判定しないよう（例: URL の「https://」や
// パーセントエンコード文字列に含まれる数字・`/`）、文字種を丸ごと制限したうえで
// 数字・演算子の両方を含むことを確認する。
function isCalcExpression(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (!/^[\d+\-*/.\s]+$/.test(trimmed)) return false;
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

const SYSTEM_COMMANDS: SystemCommand[] = [
  { action: "shutdown", label: "シャットダウン", keywords: ["shutdown"] },
  { action: "restart", label: "再起動", keywords: ["restart", "reboot"] },
  { action: "sleep", label: "スリープ", keywords: ["sleep"] },
];

function matchSystemCommands(q: string): SystemCommand[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return SYSTEM_COMMANDS.filter((cmd) =>
    cmd.keywords.some((kw) => kw.startsWith(query))
  );
}

// クエリがクリップボード呼び出しプレフィックスに前方一致する場合、続く文字列
// （履歴のテキストフィルタ）を返す。一致しない場合は null（モード非アクティブ）。
function clipboardModeFilter(query: string, prefix: string): string | null {
  if (!prefix) return null;
  if (!query.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  return query.slice(prefix.length).trim();
}

export function useSearch(
  appSettings: AppSettings,
  settingsVersion: number,
  storeRef: MutableRefObject<Store | null>
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [calcResult, setCalcResult] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<SystemCommand | null>(
    null
  );
  const [frecency, setFrecency] = useState<FrecencyMap>({});
  const frecencyRef = useRef<FrecencyMap>({});

  const calcMode = appSettings.calcEnabled && isCalcExpression(query);
  const systemMatches = useMemo(
    () =>
      calcMode || !appSettings.systemCommandEnabled
        ? []
        : matchSystemCommands(query),
    [calcMode, query, appSettings.systemCommandEnabled]
  );
  const systemMode = systemMatches.length > 0;
  const clipboardFilterText = appSettings.clipboardEnabled
    ? clipboardModeFilter(query, appSettings.clipboardPrefix)
    : null;
  const clipboardMode = clipboardFilterText !== null;

  // URLエンコード/デコード結果はファイル検索結果を置き換えず、その先頭に共存表示する
  // （calcMode/systemMode/clipboardMode のような排他モードにはしない）。
  const urlConvertResult = useMemo(() => {
    if (!appSettings.urlConvertEnabled) return null;
    if (calcMode || systemMode || clipboardMode) return null;
    return detectUrlConvertResult(query, appSettings.urlConvertKeepSpaceEncoded);
  }, [
    appSettings.urlConvertEnabled,
    appSettings.urlConvertKeepSpaceEncoded,
    calcMode,
    systemMode,
    clipboardMode,
    query,
  ]);

  useEffect(() => {
    setSelected(0);
    if (clipboardMode) {
      setResults([]);
      setCalcResult(null);
    } else if (appSettings.calcEnabled && isCalcExpression(query)) {
      setResults([]);
      invoke<string | null>("calculate", { expr: query })
        .then(setCalcResult)
        .catch(console.error);
    } else if (
      appSettings.systemCommandEnabled &&
      matchSystemCommands(query).length > 0
    ) {
      setResults([]);
      setCalcResult(null);
    } else if (appSettings.fileSearchEnabled) {
      setCalcResult(null);
      invoke<FileEntry[]>("search_files", { query })
        .then((files) => {
          setResults(sortByFrecency(files, frecency));
          setSelected(0);
        })
        .catch(console.error);
    } else {
      setCalcResult(null);
      setResults([]);
    }
  }, [query, settingsVersion, appSettings, frecency, clipboardMode]);

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

  return {
    query,
    setQuery,
    results,
    selected,
    setSelected,
    calcResult,
    calcMode,
    systemMatches,
    systemMode,
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
  };
}
