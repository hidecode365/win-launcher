export type ManageTreeRowVariant = "fixed" | "folder" | "item";

// 一覧行の選択ハイライト・ホバーには色のトランジションを掛けない。掛けると、
// 一覧が再構成されて選択行が入れ替わった瞬間に前の行の色が残ってフェードするため、
// 「一瞬どこも選択されていない」ように見えてちらつく（PO実機確認により全画面で
// 統一して削除）。行以外（ボタン・行内アイコン・フォルダ開閉の回転等）の
// トランジションは、ユーザー操作へ直接応答する演出のため従来どおり残す。
const MANAGE_TREE_ROW_BASE =
  "flex w-full items-center pr-ui-row-x text-left";

const MANAGE_TREE_ROW_VARIANTS: Record<ManageTreeRowVariant, string> = {
  fixed: `${MANAGE_TREE_ROW_BASE} h-10`,
  folder: `${MANAGE_TREE_ROW_BASE} py-ui-row-y`,
  item: `${MANAGE_TREE_ROW_BASE} py-ui-item-y`,
};

const MANAGE_TREE_ROW_IDLE: Record<ManageTreeRowVariant, string> = {
  fixed: "text-ui-muted hover:bg-ui-hover-subtle",
  folder: "text-ui-muted hover:bg-ui-hover-subtle",
  item: "text-ui-text hover:bg-ui-hover",
};

export function manageTreeRowClass(
  variant: ManageTreeRowVariant,
  { selected, muted = false }: { selected: boolean; muted?: boolean }
) {
  const stateClass = selected
    ? "bg-ui-selected text-white"
    : muted
      ? "bg-ui-hover-subtle text-ui-muted hover:bg-ui-hover"
      : MANAGE_TREE_ROW_IDLE[variant];
  return `${MANAGE_TREE_ROW_VARIANTS[variant]} ${stateClass}`;
}

export const MANAGE_TREE_ROW_LABEL: Record<ManageTreeRowVariant, string> = {
  fixed: "flex-1 truncate text-ui-meta font-medium",
  folder: "flex-1 truncate text-ui-meta font-medium",
  item: "truncate text-ui-body font-medium",
};

export const EDITOR_SURFACE_CLASS =
  "w-full resize-none rounded border border-ui-border bg-ui-surface/80 p-2 text-ui-body text-ui-text-strong outline-none focus:ring-1 focus:ring-ui-focus disabled:bg-ui-hover-subtle";
