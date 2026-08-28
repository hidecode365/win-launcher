# 計算機能・システムコマンド・プレフィックスコマンド候補

→ 詳細: [calc-and-prefix-commands.md](../../../../../docs/internal-design/calc-and-prefix-commands.md)

- 計算結果はファイル検索結果と排他にせず、先頭の別枠固定表示領域で共存させる。将来 `isCalcExpression`/`isUrlLikeInput` の判定条件が緩んだ場合に備え、計算結果→URL変換結果の表示順序をルールとして維持する。 → 詳細: [calc-and-prefix-commands.md](../../../../../docs/internal-design/calc-and-prefix-commands.md#calc-feature)
- 呼び出しキーワードの重複チェックは必ず `validate_unique_keyword` を経由させる。新しいキーワードフィールドを追加した場合は、この関数のチェック対象リストに追加する。 → 詳細: [calc-and-prefix-commands.md](../../../../../docs/internal-design/calc-and-prefix-commands.md#system-command-feature)
- 新しい "/" プレフィックス機能を追加する場合、`buildPrefixCommandCandidates` に候補生成ロジックを追加するだけで既存の表示・選択・frecencyの仕組みにそのまま乗せられる。個別の候補表示 UI を新設しない。 → 詳細: [calc-and-prefix-commands.md](../../../../../docs/internal-design/calc-and-prefix-commands.md#prefix-command-candidates)
