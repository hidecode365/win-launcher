import { useEffect, useState } from "react";

interface ModifierState {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
}

const MODIFIER_OPTIONS: { key: keyof ModifierState; label: string }[] = [
  { key: "ctrl", label: "Ctrl" },
  { key: "alt", label: "Alt" },
  { key: "shift", label: "Shift" },
  { key: "win", label: "Win" },
];

const DEFAULT_MAIN_KEY = "Space";

const MAIN_KEY_OPTIONS: string[] = [
  "Space",
  "Tab",
  "Enter",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 10 }, (_, i) => String(i)),
];

// アクセラレータ文字列（例: "Alt+Space"）をチェックボックス/プルダウンの
// 初期状態に分解する。Win キーは内部的に "Super" トークンで表現される。
function parseAccelerator(accelerator: string): {
  mods: ModifierState;
  mainKey: string;
} {
  const mods: ModifierState = { ctrl: false, alt: false, shift: false, win: false };
  let mainKey = DEFAULT_MAIN_KEY;
  for (const token of accelerator.split("+").map((t) => t.trim())) {
    const upper = token.toUpperCase();
    if (upper === "CTRL" || upper === "CONTROL") mods.ctrl = true;
    else if (upper === "ALT") mods.alt = true;
    else if (upper === "SHIFT") mods.shift = true;
    else if (upper === "SUPER" || upper === "WIN") mods.win = true;
    else if (token) mainKey = token;
  }
  return { mods, mainKey };
}

function buildAccelerator(mods: ModifierState, mainKey: string): string {
  const parts: string[] = [];
  if (mods.ctrl) parts.push("Ctrl");
  if (mods.alt) parts.push("Alt");
  if (mods.shift) parts.push("Shift");
  if (mods.win) parts.push("Super");
  parts.push(mainKey);
  return parts.join("+");
}

export function GeneralSettings({
  hotkey,
  error,
  onSave,
}: {
  hotkey: string;
  error: string | null;
  onSave: (accelerator: string) => void;
}) {
  const [mods, setMods] = useState<ModifierState>(() => parseAccelerator(hotkey).mods);
  const [mainKey, setMainKey] = useState<string>(() => parseAccelerator(hotkey).mainKey);

  // 保存成功時（appSettings.hotkey の更新）に表示を確定値へ同期する。
  // 保存に失敗した場合は hotkey prop が変化しないため、編集中の選択はそのまま残る。
  useEffect(() => {
    const parsed = parseAccelerator(hotkey);
    setMods(parsed.mods);
    setMainKey(parsed.mainKey);
  }, [hotkey]);

  const toggleMod = (key: keyof ModifierState) => {
    setMods((m) => ({ ...m, [key]: !m[key] }));
  };

  const preview = buildAccelerator(mods, mainKey);

  return (
    <div>
      <div className="text-sm font-medium text-gray-800 mb-1">
        起動ホットキー
      </div>
      <div className="text-xs text-gray-400 mb-3">
        ウィンドウの表示/非表示を切り替えるグローバルショートカットです。
      </div>

      <div className="flex items-center gap-4 mb-3">
        {MODIFIER_OPTIONS.map((m) => (
          <label
            key={m.key}
            className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={mods[m.key]}
              onChange={() => toggleMod(m.key)}
            />
            {m.label}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={mainKey}
          onChange={(e) => setMainKey(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
        >
          {MAIN_KEY_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <span className="px-3 py-1.5 rounded bg-gray-100 text-sm font-mono text-gray-700">
          {preview}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onSave(preview)}
        className="text-sm text-blue-600 hover:text-blue-700"
      >
        保存
      </button>

      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  );
}
