import { useEffect, useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsSaveBar } from "./SettingsSaveBar";

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
  onSave,
  checkUpdateOnStartup,
  onToggleCheckUpdateOnStartup,
}: {
  hotkey: string;
  onSave: (accelerator: string) => Promise<string | null>;
  checkUpdateOnStartup: boolean;
  onToggleCheckUpdateOnStartup: (checked: boolean) => void;
}) {
  const [mods, setMods] = useState<ModifierState>(() => parseAccelerator(hotkey).mods);
  const [mainKey, setMainKey] = useState<string>(() => parseAccelerator(hotkey).mainKey);
  // 保存失敗時のエラーメッセージ。タブコンポーネントのローカル state のため、
  // 他タブへ切り替える（＝このコンポーネントが unmount される）と自動的に破棄される
  // （詳細は CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const [error, setError] = useState<string | null>(null);

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
  const isDirty = preview !== hotkey;

  const handleSave = async () => {
    const err = await onSave(preview);
    setError(err);
  };

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup
        title="起動ホットキー"
        description="ウィンドウの表示/非表示を切り替えるグローバルショートカットです。"
        className=""
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-4">
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

          <div className="flex flex-wrap items-center gap-2">
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
            <span
              className={`px-3 py-1.5 rounded border text-sm font-mono text-gray-700 ${
                isDirty
                  ? "bg-amber-50 border-amber-400 ring-1 ring-amber-200"
                  : "bg-gray-100 border-transparent"
              }`}
            >
              {preview}
            </span>
          </div>
        </div>
      </SettingsGroup>

      <div className="pt-3 border-t border-gray-200/60">
        <FeatureToggle
          label="起動時にアップデートを自動チェックする"
          description="アプリ起動時に新しいバージョンがないか自動で確認します。"
          checked={checkUpdateOnStartup}
          onChange={onToggleCheckUpdateOnStartup}
        />
      </div>

      <div className="pt-3 border-t border-gray-200/60">
        <SettingsSaveBar isDirty={isDirty} onSave={handleSave} error={error} />
      </div>
    </div>
  );
}
