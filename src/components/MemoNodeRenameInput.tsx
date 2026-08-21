import { invoke } from "@tauri-apps/api/core";
import { RenameInput } from "./FavoriteEditTree";

export function MemoNodeRenameInput({
  nodeId,
  initialName,
  className,
  onRenamed,
  onCancel,
}: {
  nodeId: string;
  initialName: string;
  className: string;
  onRenamed: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const rename = async (newName: string): Promise<string | null> => {
    try {
      await invoke("rename_favorite_node", { id: nodeId, newName });
      await onRenamed();
      return null;
    } catch (error) {
      return String(error);
    }
  };

  return (
    <RenameInput
      initialName={initialName}
      className={className}
      onConfirm={rename}
      onCancel={onCancel}
    />
  );
}
