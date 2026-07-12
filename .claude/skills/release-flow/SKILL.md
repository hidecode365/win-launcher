---
name: release-flow
description: WinLauncher のリリース手順（バージョン bump → 署名付きビルド → latest.json 生成 → git tag → GitHub Release 作成・アセットアップロード → 動作確認）を実行する。ユーザーから「リリースして」「新バージョンを公開して」「vX.Y.Zをリリース」といった依頼があったとき、または既存のリリース手順を確認したいときに使う。
---

# WinLauncher リリースフロー

WinLauncher（`D:\ai_work\dev_win\win-launcher`）のリリース作業を行うためのスキル。CI は無く、すべて手元（Windows）でコマンドを順に実行する運用。ワンコマンド化はしていないため、以下のステップを順番に確認しながら進めること。

## 前提条件

- Tauri Updater の署名鍵ペアが `src-tauri/keys/`（`.gitignore` 対象）に存在すること
- ビルド前に、ユーザー自身が以下の環境変数を手元のシェルにセットしていること
  - `TAURI_SIGNING_PRIVATE_KEY`（鍵ファイルの中身、またはファイルパスそのものでも可。tauri-cli が両対応）
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（鍵生成時に設定したパスワード）
  - **これらの値は Claude が代わりに入力・保持・出力してはならない。** 未設定の場合はユーザーに設定を依頼し、Claude 自身は値を尋ねない・推測しない
- `tauri.conf.json` の `bundle.createUpdaterArtifacts: true` が設定済みであること（NSIS インストーラー本体 `.exe` に対して updater 用の署名 `.exe.sig` を直接生成するため。現行の `@tauri-apps/cli` v2 は Windows 向けに zip ラッピングを行わない）

## リリース手順（7ステップ）

1. **バージョン bump**：`package.json` と `src-tauri/tauri.conf.json` の `version` を新バージョンへ手動更新する
2. **署名付きビルド**：上記の環境変数がセットされた状態で `npm run tauri build` を実行する。失敗したら中断し、原因（署名鍵未設定、ビルドエラー等）を報告する
   - 成功すると NSIS インストーラー本体（`*_x64-setup.exe`）と署名ファイル（`*_x64-setup.exe.sig`）が `src-tauri/target/release/bundle/nsis/` に生成される（MSI 側にも `*_x64_en-US.msi` / `*_x64_en-US.msi.sig` が生成される）
3. **latest.json 生成**：`npm run generate:latest-json`（`./scripts/generate-latest-json.ps1` の npm エイリアス）を実行し、`src-tauri/target/release/bundle/latest.json` を生成する
   - `tauri.conf.json` の `version` と `last-release-notes.md` の内容を読み取り、`nsis`（無ければ `msi`）ディレクトリ配下の `*.exe.sig`（無ければ `*.msi.sig`）から署名とダウンロード URL（`https://github.com/hidecode365/win-launcher/releases/download/v{version}/{アーティファクト名}`）を組み立てる
   - 該当する `.sig` が見つからない場合はエラーで停止する（署名鍵の未設定・`createUpdaterArtifacts` の設定漏れの早期検知）
4. **リリースノート更新**：`last-release-notes.md` を今回のリリース内容に更新する
5. **git commit / tag / push**：`git commit` → `git push` → `git tag vX.Y.Z` → `git push --tags`
6. **GitHub Release 作成**：`gh release create vX.Y.Z --title "..." --notes-file last-release-notes.md`
7. **アセットアップロード**：`gh release upload vX.Y.Z` で以下の **4つ** をすべて添付する（署名文字列自体は `latest.json` に埋め込み済みのため、updater は `*.sig` ファイルを別途ダウンロードしない。`.sig` の添付は他アセットとの一貫性・参照用）
   - NSIS インストーラー本体（`*_x64-setup.exe`。`latest.json` の `url` が直接参照するダウンロード対象）
   - 署名ファイル（`*_x64-setup.exe.sig`）
   - MSI インストーラー（`*_x64_en-US.msi`。任意だが従来通り添付する）
   - `latest.json`（**アセット名は必ず `latest.json` にすること**。`tauri.conf.json` の `plugins.updater.endpoints` が参照する URL 末尾のファイル名と一致させる必要があるため、リネームせずそのままアップロードする）

git push・タグ push・`gh release create`・アセットアップロードはいずれも公開・共有状態を変更する操作のため、実行前に対象バージョンとコマンド内容をユーザーに提示し、確認を得てから実行すること。

## リリース後の動作確認チェックリスト

1. リリース前の（旧）バージョンの WinLauncher を起動しておく
2. トレイアイコンを右クリックし「Check for Updates」をクリックする
3. 新バージョン番号とリリースノートを含むダイアログが表示されることを確認する
   - 表示されない場合は `tauri.conf.json` の `plugins.updater.endpoints` と GitHub Release 側のアセット名 `latest.json` が一致しているか確認する
4. 「今すぐ更新」を押し、ダウンロード→インストーラー起動→アプリの自動終了までを確認する
5. インストーラー完了後、アプリを起動し直し、設定画面フッターのバージョン表示が新バージョンになっていることを確認する

この動作確認は `npm run tauri dev` 起動後の自動 GUI テストの対象外（プロジェクトの `CLAUDE.md` テスト方針）であり、ユーザーが手動で行う。
