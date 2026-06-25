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
import { AppSettings, FileEntry, FrecencyMap, SystemCommand } from "../types";

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

function isCalcExpression(q: string): boolean {
  return /\d/.test(q) && /[+\-*/]/.test(q);
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
    pendingCommand,
    requestSystemCommand,
    cancelSystemCommand,
    confirmSystemCommand,
    launchFile,
    copyResult,
    openWebSearch,
    setInitialFrecency,
  };
}
