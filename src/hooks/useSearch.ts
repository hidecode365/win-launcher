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
  PrefixCommand,
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
  const [selected, setSelected] = useState(0);
  const [calcResult, setCalcResult] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<SystemCommand | null>(
    null
  );
  const [frecency, setFrecency] = useState<FrecencyMap>({});
  const frecencyRef = useRef<FrecencyMap>({});
  const [prefixCommandFrecency, setPrefixCommandFrecency] =
    useState<FrecencyMap>({});
  const prefixCommandFrecencyRef = useRef<FrecencyMap>({});

  const calcMode = appSettings.calcEnabled && isCalcExpression(query);
  const clipboardFilterText = appSettings.clipboardEnabled
    ? clipboardModeFilter(query, appSettings.clipboardPrefix)
    : null;
  const clipboardMode = clipboardFilterText !== null;

  // クリップボード履歴モード（完全な呼び出しキーワードが入力済み）が有効な間は、
  // 候補一覧ではなく既存の clipboardMode（2カラムパネル）を優先する。
  const prefixCommandCandidates = useMemo(
    () =>
      calcMode || clipboardMode
        ? []
        : sortPrefixCommandsByFrecency(
            buildPrefixCommandCandidates(query, appSettings),
            prefixCommandFrecency
          ),
    [calcMode, clipboardMode, query, appSettings, prefixCommandFrecency]
  );
  const prefixCommandMode = prefixCommandCandidates.length > 0;

  // URLエンコード/デコード結果はファイル検索結果を置き換えず、その先頭付近に共存表示する
  // （prefixCommandMode/clipboardMode のような排他モードにはしない）。
  // calcMode（数式らしい入力）は isCalcExpression の許容文字クラスが数字・演算子・括弧・
  // 空白・小数点のみでレターを含まないため、`http(s)://` から始まる URL 的な入力とは
  // 構造上同時に true にならない。よってここで calcMode を明示的に除外しなくても
  // urlConvertResult と calcResult が同時に発生することはない。
  const urlConvertResult = useMemo(() => {
    if (!appSettings.urlConvertEnabled) return null;
    if (prefixCommandMode || clipboardMode) return null;
    return detectUrlConvertResult(query, appSettings.urlConvertKeepSpaceEncoded);
  }, [
    appSettings.urlConvertEnabled,
    appSettings.urlConvertKeepSpaceEncoded,
    prefixCommandMode,
    clipboardMode,
    query,
  ]);

  // calcMode（数式らしい入力）とファイル検索は排他にせず、両方を独立して実行する。
  // 計算結果は urlConvertResult と同様にファイル検索結果とは別枠の固定表示領域として
  // 共存表示するため（詳細は ResultList を参照）、ここでは setResults([]) による
  // ファイル検索結果のクリアは行わない。
  useEffect(() => {
    setSelected(0);
    if (clipboardMode) {
      setResults([]);
      setCalcResult(null);
      return;
    }
    if (prefixCommandMode) {
      setResults([]);
      setCalcResult(null);
      return;
    }

    if (appSettings.calcEnabled && isCalcExpression(query)) {
      invoke<string | null>("calculate", { expr: query })
        .then(setCalcResult)
        .catch(console.error);
    } else {
      setCalcResult(null);
    }

    if (appSettings.fileSearchEnabled) {
      invoke<FileEntry[]>("search_files", { query })
        .then((files) => {
          setResults(sortByFrecency(files, frecency));
          setSelected(0);
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
      } else if (candidate.kind === "clipboard") {
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
