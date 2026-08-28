# issue管理(mng/issues/)の確認・更新方法

アプリ開発のissueは、MG側Vaultの `../mng/issues/` で管理する。MGからissueに関する指示を受けた場合は、まず対象issueファイルを読むこと。

ADは、担当issueについて次を直接更新してよい。

- `status`、`updated`、`next_action`
- 進捗(ToDo)チェックリスト
- クローズ時の記録

状態を変更する場合は、`updated` と `next_action` も同時に更新する。`closed` にする場合は、確認者・確認日・関連コミット等のクローズ根拠を「クローズ時の記録」に残す。POの受入・判断を工程ゲートとして必要とする変更は、該当するPOゲートが完了するまでcloseしない。判断に迷う場合は `in-progress` のまま `next_action` を「PO/MGのclose可否確認待ち」とし、`../mng/handoff/ad.md` でMGへ確認する。

起票・採番・`_template.md`・`index.md` のDataviewクエリの変更はMG専属とし、ADは直接変更しない。上記の運用ルール(編集範囲・close基準等)は、この節自体を正本とする。
