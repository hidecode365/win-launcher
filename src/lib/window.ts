import { getCurrentWindow } from "@tauri-apps/api/window";

export async function hideWindow(): Promise<void> {
  await getCurrentWindow().hide();
}
