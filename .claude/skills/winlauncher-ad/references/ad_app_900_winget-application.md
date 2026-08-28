# WinGetパッケージの新バージョン申請手順

既存パッケージ（`hidecode365.WinLauncher`）へのバージョン追加（update申請）の手順。初回の新規パッケージ申請（new）とは別の手順。

1. `gh release view <tag> --repo hidecode365/win-launcher --json assets` でリリースアセット一覧を取得し、インストーラー（`.exe`）のダウンロード URL を確認する（`.sig`・`latest.json`・`.msi` は申請に使わない。既存マニフェストが `.exe`（nullsoft）のみ登録のため、`.msi` を追加すると `wingetcreate update` がインストーラー URL 数の不一致でエラーになる。既存マニフェストのインストーラー種別・数は `winget show hidecode365.WinLauncher` で事前に確認できる）
2. `wingetcreate update hidecode365.WinLauncher --version <バージョン> --urls <exeのURL>` を（`--submit` なしで）実行し、ローカルにマニフェスト（`manifests/h/hidecode365/WinLauncher/<バージョン>/` 配下に3ファイル）を生成する
3. 生成された `*.locale.en-US.yaml` の `Documentations`（Wiki リンク）を削除する。このリポジトリに Wiki ページが存在せずリンク切れになるため
4. 内容を確認したうえで `wingetcreate submit "manifests/h/hidecode365/WinLauncher/<バージョン>"` でPRを提出する（ローカルで編集済みのマニフェストをそのまま送るため、`update --submit` で再実行しない）。この提出操作自体（取り消しにくい公開操作）は、実行前に一度ユーザーの承認を得る
5. `submit` が「フォークされたリポジトリをアップストリームコミットと同期できませんでした」で失敗する場合がある。その場合は `gh api -X POST repos/<GitHubユーザー名>/winget-pkgs/merge-upstream -f branch=master` でフォークの `master` ブランチを upstream（`microsoft/winget-pkgs`）へ fast-forward 同期してから `submit` を再実行する（新規コミット作成・履歴改変を伴わない同期のみのため、事前の個別承認なしで実行してよい）
6. `--submit`／`submit` 実行時、GitHub認証（デバイスコード）を求められる場合がある（過去の認証がキャッシュされていれば省略されることもある）。求められた場合は表示されたコードとURLをユーザーに案内し、ブラウザでの認証完了を待つ
7. 提出後に表示されるPR URL（`https://github.com/microsoft/winget-pkgs/pull/<番号>`）をユーザーに報告する
8. `wingetcreate` はカレントディレクトリ（このリポジトリのルート）配下に `manifests/h/hidecode365/WinLauncher/<バージョン>/` を生成する。過去の初回申請（v0.1.0）分はこのリポジトリに `git add` 済みでコミット履歴に残っているため、後始末で削除する際は **新しく生成した対象バージョンのフォルダのみ**を指定して削除すること（`manifests/` ディレクトリ全体を `rm -rf` すると、コミット済みの過去バージョン分まで巻き込んで削除してしまう）。削除前に `git status` で意図した範囲だけが untracked になっているか必ず確認する。この後始末はPR提出後にAD自身の判断で実施してよく、都度MGへ確認を求める必要はない
9. WinGet申請PRのレビュー・マージ状況の追跡はPOが直接行う。PRのマージ完了はissueのclose条件・700工程の完了条件に含めない（issueの進捗とは切り離して扱う）
