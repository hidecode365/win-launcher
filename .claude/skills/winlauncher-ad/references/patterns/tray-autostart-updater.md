# システムトレイ・自動起動・自動アップデート

→ 詳細: [tray-autostart-updater.md](../../../../../docs/internal-design/tray-autostart-updater.md)

- トレイメニューに新しい項目を追加する場合、既存の並び順（Show → Check for Updates → Start with Windows → Restart → Quit）を踏まえた位置に追加する。 → 詳細: [tray-autostart-updater.md](../../../../../docs/internal-design/tray-autostart-updater.md#system-tray)
- アップデートダイアログの新しい状態を追加する場合、`SystemCommandModal` と同じオーバーレイ＋カードのデザインパターンを踏襲する。`download_and_install_update` はダウンロード完了後にプロセスが終了し制御が戻らない前提を維持する。 → 詳細: [tray-autostart-updater.md](../../../../../docs/internal-design/tray-autostart-updater.md#auto-update)
