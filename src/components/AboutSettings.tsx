import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";

const GITHUB_URL = "https://github.com/hidecode365/win-launcher";
const X_URL = "https://x.com/hidecode365";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/hidecode365";

function AboutLinkRow({ label, url }: { label: string; url: string }) {
  return (
    <button
      type="button"
      onClick={() => open(url)}
      className="text-left text-sm text-blue-600 hover:text-blue-700 hover:underline w-fit"
    >
      {label}
    </button>
  );
}

export function AboutSettings() {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then((v) => setVersion(v));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-medium text-gray-800 mb-1">バージョン情報</div>
        <div className="text-sm text-gray-600">バージョン {version}</div>
      </div>
      <div className="pt-3 border-t border-gray-200/60">
        <AboutLinkRow label="GitHubリポジトリ" url={GITHUB_URL} />
      </div>
      <div className="pt-3 border-t border-gray-200/60">
        <AboutLinkRow label="X (@hidecode365)" url={X_URL} />
      </div>
      <div className="pt-3 border-t border-gray-200/60">
        <AboutLinkRow
          label="開発者を応援する（Buy Me a Coffee）"
          url={BUY_ME_A_COFFEE_URL}
        />
      </div>
    </div>
  );
}
