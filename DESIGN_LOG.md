# DESIGN_LOG

200_設計 工程での設計協議の一時記録。運用ルールは [WORKFLOW.md](WORKFLOW.md) の 200_設計・500_リリース前作業 の節、および [docs/process/cc_app_200_design.md](docs/process/cc_app_200_design.md)・[docs/process/cc_app_500_pre-release.md](docs/process/cc_app_500_pre-release.md) を参照。

- トピックごとに `##` 見出しで区切って追記する（1トピック1見出し。複数トピックを1つの見出しにまとめない）
- 500_リリース前作業 で `CLAUDE.md`/`docs/design/*.md` への正式反映が確認できたトピックの見出しのみを削除する（部分クリア。他の未反映トピックを巻き込んで削除しない）
- 反映済みかどうか判断がつかない見出しを見つけた場合、存在するというだけで自動的に削除せず、`CLAUDE.md`・対応する `docs/design/*.md` の実際の記載と突き合わせてから判定する

## お気に入り編集ビュー実装のフェーズ分割

REQUIREMENTS.md確定（お気に入り機能・段階3の要件定義。編集ビュー新設・`/favorite`モードのキーボード操作拡張・`collapsed`永続化）後の技術設計として、実装を以下4つの軸に分割する案をCCへ批評依頼した。

- 軸1: 選択ドメインの拡張（`favoriteSelectionItems` → `favoriteTree`）
- 軸2: キーボード操作の拡張（フォルダ見出し行でのEnter開閉トグル等）
- 軸3: `collapsed`の永続化
- 軸4: お気に入り編集ビューの新規UI

CCの批評で以下4件の指摘があった。

1. 軸1が、intentタイムアウト監視effect（`useSearch.ts` の expiresAt 経過後 top へフォールバックする処理）に favoriteMode 分岐が無いことを見落としていた
2. 編集ビューでの重複名チェック省略という当初案が、`add_favorite_folder` の既存バリデーション（過去の同名フォルダによる取り違えバグの再発防止策として導入済み。詳細は `docs/design/favorites-data-model.md` の「同一階層内の同名フォルダ作成を禁止するバリデーション」節を参照）と矛盾していた
3. D&Dによるフォルダをまたぐ再親化（reparent）には新規Rustコマンドが必要（既存の `move_favorite_node` は同一親内の隣接スワップのみ対応）
4. 検索/設定の二択swapに3枚目のビューを追加するには、`boolean` ではなく enum 等への状態設計変更が必要

CA・POは①③④を採用し、②はCCの指摘通り認識の誤りだったため判断を撤回し、重複名バリデーションを維持する方針に戻した（REQUIREMENTS.md修正6を訂正）。

軸4を以下に再分割し、4a・4cを先行、4b・4d・4eは軸1完了後（4d・4eは重複チェック方針確定後）とする実装順序で合意した。

- 4a: ビュー骨格（表示/非表示の切り替え・状態保持のみ）
- 4b: 読み取り専用のツリー描画＋選択（軸1完了後）
- 4c: 作成・削除
- 4d: リネーム（新規Rustコマンドが必要）
- 4e: D&D再親化（新規Rustコマンドが必要）
