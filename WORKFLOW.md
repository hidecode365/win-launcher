# WinLauncher — 開発工程定義

WinLauncher の開発は、ひでさん（発案・最終判断）・CA（claude.ai。要件の構造化・設計案の起草・仲介）・CC（Claude Code。実装・分析・実行）の3者体制で進める。本ファイルはその開発工程を 000〜700・900 の工程帯に分割し、各工程での INPUT/PROCESS/OUTPUT・実施要領・3者の役割を定義する。

`CLAUDE.md`「開発フロー」節はこのファイルへのポインタのみを持つ。両ファイルに同じ内容を重複して書かない。

## 改訂ルール

この工程定義表自体の改訂は、200_設計 のプロセス（CA起草 → CC批評 → ひでさん判断）を自己適用する。専用の工程番号は設けない。

## 実施要領ファイルの命名規則

```text
{アクター: ca|cc}_{担当領域: app|site等}_{連番}_{工程名}.md
```

- 連番は100刻み。間の工程が将来増えても拡張できる余地を残す
- 担当領域は現状 `app`（WinLauncher アプリ本体）のみ。将来 `site`（紹介サイト）等が同じ枠組みに合流する可能性を見込んだ命名。数字だけの識別子（cc01, cc02等）は使わず、役割が分かる語を使う
- `cc_app_*.md` は `docs/process/` に格納する（このリポジトリが正本）
- `ca_app_*.md` はこのリポジトリには格納しない。CA 側（claude.ai のカスタム Skill）の別領域で管理する

| 連番帯 | 意味 |
| --- | --- |
| 000 | 運用管理（随時・並行） |
| 100 | 要件定義 |
| 200 | 設計 |
| 300 | 実装 |
| 400 | テスト（バグ修正） |
| 500 | リリース前作業 |
| 600 | リリース |
| 700 | リリース後作業 |
| 900 | 工程横断（cross） |

### CC側に900番台（横断ファイル）が存在しない理由

CC 側にとっての「工程を問わず参照する恒久的な内容」は、`CLAUDE.md`（行動規範＋原則ダイジェスト）と `docs/design/*.md`（詳細な仕様・経緯）が既にその役割を担っている。CA 側の `ca_app_900_*`（プロンプトの書き方、UI規約等）とは参照される情報の実体が異なるため、対称に `cc_app_900_*` を新設する必要はない。

**この判断は `app` 領域固有の事情に基づくものである。** 将来 `site` 領域が合流する際、`site` 側に `CLAUDE.md`/`docs/design/*.md` に相当する恒久ドキュメントが存在しなければこの非対称性の理由はそのまま転用できない。`site` 領域合流時に改めて再検証すること。誤って `cc_app_900_*` や `cc_app_000_*`（CC側の運用管理ファイル）を機械的に新設しないよう、ここに明記しておく。

## 工程定義表

### 000_運用管理（随時・並行）

- CA INPUT: 記憶の内容、Skill の内容、会話全体
- CC INPUT: セッション冒頭のひでさんからの状態報告依頼
- PROCESS: 1. 記憶⇄Skill の仕分け判定 2. セッション引継ぎ文書の作成 3. セッション冒頭の作業ツリー状態報告（CC）
- CA OUTPUT: 更新済み Skill、引継ぎ文書
- CC OUTPUT: 作業ツリーの状態報告（未コミット変更・未プッシュコミット）
- CA実施要領: `ca_app_000_memory-skill.md`（CA 側で管理。このリポジトリには格納しない）
- CC実施要領: （該当なし。作業が数行に収まるため、独立した実施要領ファイルを設けず本節に直接記載する）
- 役割・振る舞い: CA は都度の仕分け判定を主体的に行う。ひでさんは記憶に残すべき「機転」を都度指摘する
- ドキュメント鮮度確認: CA はセッション開始時のドキュメント確認を `raw.githubusercontent.com` からの直接取得（bash + curl 経由）で行う。GitHub の blob ページ（`github.com/.../blob/...`）はキャッシュにより古い内容を返すことがあるため使用しない。確認対象ファイルの固定リストは CA 側（Skill）で管理する（GitHub Contents API は未認証アクセスがレート制限にかかるため、ディレクトリ一覧の動的取得には使えない）
- CC はセッション冒頭、ひでさんの依頼を受けて `git status --short`（未コミット変更）と `git log origin/main..HEAD --oneline`（未プッシュのコミット）を報告する
- raw 取得内容が有効なのは、CC からファイル変更の報告を受けるまでの間。以降は CC の報告を正本とする（時間経過ではなく「ファイル変更の報告を受けたかどうか」を基準とする）
- （検討済み・見送り）CC がリポジトリ直下に context ZIP を生成しひでさんが CA へ渡す方式を検討したが、blob ページの代わりに raw URL を使うことで同じ問題（キャッシュ・トークン効率）が解決するため見送った（2026-07-31）

### 100_要件定義

- CA INPUT: ひでさんの要求（自然文）、現状の `REQUIREMENTS.md`
- CC INPUT: CA からの解釈確認依頼、現状の `REQUIREMENTS.md`
- PROCESS: 1. 要件を文章化 2. CC へ解釈確認を依頼 3. 協議 4. `REQUIREMENTS.md` 更新指示
- CA OUTPUT: 更新指示（CC へのプロンプト）
- CC OUTPUT: 更新済み `REQUIREMENTS.md`（CC が実際に編集する）、解釈確認への回答
- CA実施要領: `ca_app_100_requirements.md`（CA 側で管理）
- CC実施要領: [cc_app_100_requirements.md](docs/process/cc_app_100_requirements.md)
- 役割・振る舞い: ひでさんは要求の発案・最終承認。CA は要求を要件として構造化。CC は「この要件はこう実装解釈することになるが良いか」を返す

### 200_設計

- CA INPUT: 更新済み `REQUIREMENTS.md`
- CC INPUT: CA の設計案（過去の関連議論の要約を含む）、`DESIGN_LOG.md`、関連する `docs/design/*.md`（CC 自身が判断し明示的に読む。自動ロードされない点に注意）
- PROCESS: 1. CA が設計案を起草 2. CC へ批評依頼 3. 必要なら往復 4. ひでさんが結論を判断 5. `DESIGN_LOG.md` へトピック単位の見出しで記録
- CA OUTPUT: 設計案、批評依頼プロンプト
- CC OUTPUT: 設計への批評（懸念なしの場合も明記）、`DESIGN_LOG.md` への追記
- CA実施要領: `ca_app_200_design.md`（CA 側で管理）
- CC実施要領: [cc_app_200_design.md](docs/process/cc_app_200_design.md)
- 役割・振る舞い: CA は設計案のたたき台を作り、CC の批評をひでさんへ正確に伝える。CC は単なる実装可否でなく設計そのものへ意見する。ひでさんは見解が割れた際の最終判断者

### 300_実装

- CA INPUT: `DESIGN_LOG.md` の結論、`REQUIREMENTS.md`
- CC INPUT: CA からの実装プロンプト、関連する `docs/design/*.md`（CC 自身が判断し明示的に読む）
- PROCESS: 1. CA が実装プロンプト作成 2. CC が実装 3. `cargo build`/`tsc --noEmit`
- CA OUTPUT: 実装プロンプト
- CC OUTPUT: 実装済みコード、ビルド結果報告
- CA実施要領: `ca_app_300_implementation.md`（CA 側で管理）
- CC実施要領: [cc_app_300_implementation.md](docs/process/cc_app_300_implementation.md)
- 役割・振る舞い: CA は設計合意事項を具体的な実装指示に翻訳。CC は指示通りに実装しつつ、判断が必要な箇所は必ず報告する

### 400_テスト（バグ修正）

- CA INPUT: ひでさんからの不具合報告
- CC INPUT: CA からの調査依頼
- PROCESS: 1. 動作確認（ひでさん） 2. 原因分析（CC） 3. 横並び確認 4. 対処案検討 5. 100/200/300 いずれかへ差し戻し判断
- CA OUTPUT: 差し戻し先の提案
- CC OUTPUT: 原因分析結果、対処案、修正済みコード
- CA実施要領: `ca_app_400_test-bugfix.md`（CA 側で管理）
- CC実施要領: [cc_app_400_test-bugfix.md](docs/process/cc_app_400_test-bugfix.md)
- 役割・振る舞い: ひでさんは動作確認と不具合報告。CC は原因分析と横並び確認、対処案の提示。CA は差し戻し先の判断をひでさんへ提案する

### 500_リリース前作業

- CA INPUT: テスト合格の報告
- CC INPUT: CA からのドキュメント反映依頼
- PROCESS: 1. `CLAUDE.md`/`docs/design/` への正式反映 2. `README.md` への反映（必要時のみ。英語指定を含める） 3. 反映確認 4. `DESIGN_LOG.md` の該当セクションのみクリア 5. 依存関係最終確認
- CA OUTPUT: 反映確認結果
- CC OUTPUT: 更新済み `CLAUDE.md`/`docs/design/`、更新済み `README.md`（該当時）
- CA実施要領: `ca_app_500_pre-release.md`（CA 側で管理）
- CC実施要領: [cc_app_500_pre-release.md](docs/process/cc_app_500_pre-release.md)（`DESIGN_LOG.md` のクリア漏れが無いかを次回セッション開始時に機械的に確認する運用ルールを含む）
- 役割・振る舞い: CC はドキュメント反映と `DESIGN_LOG.md` の該当セクションクリアを実施。CA は反映内容を確認する

### 600_リリース

- CA INPUT: リリース可能な状態の報告
- CC INPUT: ひでさんのリリース判断（CA を経由して伝達される）
- PROCESS: 1. リリース判断（ひでさん） 2. GitHub Release 実行（CC）
- CC OUTPUT: リリース済みバイナリ、タグ
- CA実施要領: `ca_app_600_release.md`（CA 側で管理）
- CC実施要領: [cc_app_600_release.md](docs/process/cc_app_600_release.md)
- 役割・振る舞い: ひでさんはリリース可否の最終判断。CC が実行する。600 も他の工程と同じく「ひでさん → CA → CC」の経路で開始する運用に統一しており、ひでさんが CC へ「リリースして」と自然文で直接指示し CC が自己起動する運用は行わない（旧 `.claude/skills/release-flow/SKILL.md` は廃止済み）

### 700_リリース後作業

- CA INPUT: リリース完了の報告
- CC INPUT: （該当作業のみ都度）
- PROCESS: 1. X告知文作成（CA） 2. 投稿（ひでさん） 3. WinGet申請（該当バージョンまとめて実施時。CC） 4. 紹介サイト更新（該当時。別リポジトリ・別CC）
- CA OUTPUT: X告知文案
- CC OUTPUT: WinGet申請結果、紹介サイト更新結果（該当時）
- CA実施要領: `ca_app_700_post-release.md`（CA 側で管理）
- CC実施要領: （該当なし。紹介サイトは別リポジトリ・別CC）
- 役割・振る舞い: CA は告知文作成。ひでさんは投稿・紹介サイト更新要否の判断。CC は WinGet申請（まとめて実施）・紹介サイト更新の実行を担う
