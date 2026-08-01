// キー操作ヒントの共通表示部品。「キー表記」を軽いチップとして表示し、直後に
// 効果の説明文を詰めて並べる（REQUIREMENTS.md「フッター表示規約（全画面共通）」
// 節を参照）。全画面のフッター（StatusFooter.tsx・FavoriteEditFooter.tsx・
// SettingsPanel.tsx）で共有する。
//
// チップの配色は試作2案目：`bg-gray-100`（元の濃さ）に薄いボーダー
// （`border border-black/10`）を追加し、輪郭で区切りを明確にする方式。
// 1案目の `bg-gray-200`（背景を一段濃くするだけの方式）は「まだ見づらい」との
// フィードバックを受け、この案と比較検証するために変更した（経緯は
// docs/design/status-footer.md を参照）。
// 件数バッジ（FavoriteEditTree.tsx の `directChildCount` 表示）とは別の配色・
// 形状（角丸長方形のチップ、円形バッジではない）のため、意匠を混同しない。
export function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded border border-black/10 bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
        {keys}
      </span>
      <span>{label}</span>
    </span>
  );
}
