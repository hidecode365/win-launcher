import { getCurrentWindow } from "@tauri-apps/api/window";
import { screenTransition } from "./screenTransitionController";

export async function hideWindow(): Promise<void> {
  // 画面切替の枠内演出は、非表示の開始と同時に（await の前に）再生中・開始待ちとも
  // 同期的に取り消す。再表示で続きが出ないようにするため（issue 0032）。
  screenTransition.cancel();
  await getCurrentWindow().hide();
}
