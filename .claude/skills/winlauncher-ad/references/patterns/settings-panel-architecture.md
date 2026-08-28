# 設定画面の共通アーキテクチャ

→ 詳細: [settings-panel-architecture.md](../../../../../docs/internal-design/settings-panel-architecture.md)

- 設定パネルのタブを追加・削除・改名する場合、タブ一覧の正本（`#settings-tabs-list`）を含む全箇所（コード・00-requirements.md・AGENTS.mdディレクトリ構成図）を同時に更新する。 → 詳細: [settings-panel-architecture.md](../../../../../docs/internal-design/settings-panel-architecture.md#settings-tabs-list)
- 設定画面のどの箇所にも縦ラインによる区切り（`border-l`）を使わない。階層構造は `SettingsIndent`、グループ見出しは `SettingsGroup` を使う。区切りは `gap` の広さ、または見出し＋横罫線で表現する。 → 詳細: [settings-panel-architecture.md](../../../../../docs/internal-design/settings-panel-architecture.md#indent-and-group)
- 新しい設定項目を追加する場合、テキスト・数値・タグ入力は `useSettingsDraft` ＋ `SettingsSaveBar` の一括保存パターンに乗せ、トグル・チェックボックス・ラジオボタンは即時保存のパターンに乗せる。どちらにも当てはまらない独自の保存 UI を新設しない。 → 詳細: [settings-panel-architecture.md](../../../../../docs/internal-design/settings-panel-architecture.md#save-model)
- バリデーションエラーは常にそれを表示するコンポーネント自身のローカル state として持つ。タブより上位のフック（`useSettings`/`useHotkey` 等）にエラー state を持たせない。`set_*` 系フックコールバックは「成功時 `null`、失敗時エラーメッセージ文字列」という `Promise<string | null>` の契約に統一する。 → 詳細: [settings-panel-architecture.md](../../../../../docs/internal-design/settings-panel-architecture.md#error-state-location)
