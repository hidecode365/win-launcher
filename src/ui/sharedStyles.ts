export type BrowseTreeRowVariant = "folder" | "item";

const BROWSE_TREE_ROW_BASE =
  "flex w-full items-center pr-ui-row-x text-left transition-colors";

const BROWSE_TREE_ROW_VARIANTS: Record<BrowseTreeRowVariant, string> = {
  // FavoriteListPanelの件数IconSlot（24px）＋上下8pxが作る40pxを行自身の契約にする。
  folder: `${BROWSE_TREE_ROW_BASE} min-h-10 py-ui-row-y`,
  // FavoriteListPanelの名前＋パス（36px）＋上下10pxが作る56pxを行自身の契約にする。
  item: `${BROWSE_TREE_ROW_BASE} min-h-14 py-ui-item-y`,
};

const BROWSE_TREE_ROW_IDLE: Record<BrowseTreeRowVariant, string> = {
  folder: "text-ui-muted hover:bg-ui-hover-subtle",
  item: "text-ui-text hover:bg-ui-hover",
};

export function browseTreeRowClass(
  variant: BrowseTreeRowVariant,
  { selected }: { selected: boolean }
) {
  const stateClass = selected
    ? "bg-ui-selected text-white"
    : BROWSE_TREE_ROW_IDLE[variant];
  return `${BROWSE_TREE_ROW_VARIANTS[variant]} ${stateClass}`;
}

export type ManageTreeRowVariant = "fixed" | "folder" | "item";

const MANAGE_TREE_ROW_BASE =
  "flex w-full items-center pr-ui-row-x text-left transition-colors";

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
