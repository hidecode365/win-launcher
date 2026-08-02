import { invoke } from "@tauri-apps/api/core";

// 400_テスト・バグ修正：システムコマンド確認モーダルの「Enterの二重keydownにより
// 確認ダイアログを経ずに即実行されてしまう」不具合の調査用に追加した暫定計測。
// Rust側の log_ui_event コマンド（src-tauri/src/main.rs）が fsync 付きでディスク
// （app_log_dir() 配下の ui_debug.log）へ書き込むため、execute_system_command の
// 発火（OS操作）より前に呼び出し元が必ず await すれば、その時点までのログは
// プロセスが消えても残る。
//
// 原因特定・暫定対処（SYSTEM_COMMAND_CONFIRM_GRACE_MS。useSearch.ts を参照）の
// 実装後もこの計測自体は意図的に残している。恒久的な構造化ログ機能（別途
// 100〜200工程で着手予定）の実装イメージ・参考実装として活用できる可能性がある
// ため。システムコマンド確認という低頻度の経路にのみ仕込んでおり性能への影響は
// 無視できる。恒久的なログ機能が整備された時点で、この一時計測（本ファイル・
// log_ui_event コマンド・各呼び出し箇所）を役目を終えたものとして削除するか、
// 恒久実装へ統合するかを判断すること。
export function logUiEvent(line: string): Promise<void> {
  return invoke<void>("log_ui_event", { line }).catch((e) => {
    console.error("[logUiEvent] failed", e);
  });
}
