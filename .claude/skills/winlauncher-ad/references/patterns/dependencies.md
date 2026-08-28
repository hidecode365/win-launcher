# 依存ライブラリ・プラグインの選定理由

→ 詳細: [dependencies.md](../../../../../docs/internal-design/dependencies.md)

- 新しいダイアログ・ポップアップ的なUIをTauriプラグインで実装する場合、`alwaysOnTop: true` のメインウィンドウとの重なりが問題にならないか必ず確認する。フロントエンドのJS APIに親ウィンドウ指定の手段がない場合はRust側のTauriコマンドとして実装し直す。 → 詳細: [dependencies.md](../../../../../docs/internal-design/dependencies.md#dialog-plugin-parent-window)
- Windows固有の機能を実装する際は、まずWindows標準API（Win32／WinRT／COM）で直接実装できないかを検討し、サードパーティクレートは標準APIでの実装が著しく煩雑になる場合の代替手段として扱う。 → 詳細: [dependencies.md](../../../../../docs/internal-design/dependencies.md#windows-api-first-policy)
- 依存の更新保留（`glib` 等）は、保留理由（上流の制約）を明記したまま残す。理由を書かずに「保留中」とだけ記録しない。 → 詳細: [dependencies.md](../../../../../docs/internal-design/dependencies.md#dependency-update-status)
