import type { ReactNode } from "react";

// 全画面共通のフッター外枠。「フッター表示規約（全画面共通）」節を参照。
// 左側にキー操作チップ群（KeyHint。呼び出し元が children として渡す）、
// 右端にアプリのバージョン番号を表示するレイアウトに統一する。バージョン番号は
// App.tsx 側で一度だけ `getVersion()` を取得し、この共通コンポーネントへ props
// として渡す（各フッターが個別に `getVersion()` を呼ばない。以前は
// SettingsPanel.tsx がタブ切り替えのたびに再マウントされない自身のフッターの
// ためだけに個別取得していたが、フッターが複数画面に展開されたことに伴い
// 一箇所に集約した）。
export function FooterBar({
  children,
  version,
}: {
  children: ReactNode;
  version: string;
}) {
  return (
    <div className="px-4 py-1.5 border-t border-gray-200/60 flex items-center justify-between gap-3 text-xs text-gray-400">
      <div className="flex items-center gap-3 flex-wrap min-w-0">
        {children}
      </div>
      {version && <span className="flex-shrink-0">v{version}</span>}
    </div>
  );
}
