# 計算機能・システムコマンド・プレフィックスコマンド候補表示

対象コード: `src-tauri/src/main.rs`（`calculate`／`execute_system_command`／`validate_unique_keyword`）、`src/hooks/useSearch.ts`（`isCalcExpression`／`matchSystemCommands`／`buildPrefixCommandCandidates`）。

## 現在の設計

<a id="calc-feature"></a>

### 計算機能（Rust / フロントエンド）

- `appSettings.calcEnabled` が `false` の場合、入力内容に関わらず `calculate` コマンドを呼ばない（計算結果表示欄自体を出さない）
- `calcEnabled` が `true` のとき、入力文字列が数字と演算子（`+ - * /`）・括弧のみで構成され、数字と演算子を1文字以上含む場合（`isCalcExpression`）に自動で `calculate` を呼び出す
- **「暗黙判定モードはファイル検索と共存させ、表示順序を固定する」という方針**は外部設計書 [04-platform-policies.md#implicit-mode-coexistence](../external-design/04-platform-policies.md#implicit-mode-coexistence) へ移設した。実装上は、数式らしい入力であっても `search_files` とは排他にせず両方を独立して実行し、計算結果を別枠固定表示領域に描画する
  - 判定関数の実体は `isCalcExpression`（数字・演算子・括弧のみ）と `isUrlLikeInput`（`http(s)://` 始まり、レターを含む）。許容文字クラスが構造上排他のため、現状は両者が同時に成立しない
  - 選択中に Enter またはクリックで結果をクリップボードにコピーしてウィンドウを閉じる挙動は `urlConvertResult` と同一
- Rust 側で四則演算・括弧（優先順位対応の再帰下降パーサ）を評価し、結果を返す。自前実装（外部クレート未使用）。`tokenize`（字句解析）→ `Parser`（`parse_expr` → `parse_term` → `parse_factor` の3段構成の再帰下降パーサ）→ `calculate_expr`（トークン列が丁度消費し切れているかを検証してから評価結果を返す）の流れで評価する
  - `Token` は `Num` / `Plus` / `Minus` / `Star` / `Slash` に加え `LParen`（`(`） / `RParen`（`)`）を持つ
  - 括弧は `parse_factor`（`factor := ('+' | '-')* (number | '(' expr ')')`）で処理する。`(` を検出したら `parse_expr` を再帰呼び出しして中身を評価し、続く `)` を消費する。`)` が見つからない場合は `None` を返し、既存のパース失敗時と同様に `calculate` コマンドの戻り値が `None` になる
- `calculate` が `None` を返した場合（ゼロ除算・パース不能な式・括弧の対応不整合を含む）は計算結果表示欄自体を表示せず、ファイル検索結果はインデックス0から通常通り表示する（「計算できません」のような固定メッセージは表示しない）
- 表示は常にカンマ区切り。コピー時にカンマ区切りを含めるかは `appSettings.copyWithComma`（デフォルト `true`）に従う。フロントエンドはこの値を見て `formatWithCommas` を適用するかをコピー直前に切り替える

<a id="system-command-feature"></a>

### システムコマンド機能（Rust / フロントエンド）

明示プレフィックスは「`/`（固定の区切り文字） + キーワード（コマンドごとに個別カスタマイズ可能）」の2部構成。`/` 自体を変更する設定項目はない。

- `AppSettings` は `shutdown_keyword` / `restart_keyword` / `sleep_keyword` の3フィールドを持つ（デフォルトはそれぞれ `"shutdown"` / `"restart"` / `"sleep"`）
- `appSettings.systemCommandEnabled` が `false` の場合、システムコマンドの候補は一切表示しない
- `systemCommandEnabled` が `true` のとき、検索クエリが `/` + 各コマンドのキーワード（大小文字区別なし）に前方一致するかどうかをコマンドごとに独立して判定する（`matchSystemCommands`）。コマンドごとに `/` + キーワード全体の文字列に対してクエリが前方一致するかを判定する（クリップボード履歴のような「共通プレフィックス＋残り文字列の抽出」ではない）
- モードが有効な間はファイル検索・計算結果表示を行わない（Windows のファイル名に `/` を使用できないため、ファイル検索と共存させる実益がなく排他のまま）
- キーワードへの前方一致のため、例えばキーワードが既定値のままなら `/re` で「再起動」、`/s` で「シャットダウン」「スリープ」の両方が候補に出る
- マッチしたシステムコマンドは、クリップボード履歴・最近使ったファイル一覧の呼び出しキーワードと合わせて統一された候補一覧（`prefixCommandCandidates`）としてフロントエンドが表示・選択を扱う（詳細は [prefix-command-candidates](#prefix-command-candidates) を参照）
- 各キーワードは設定画面の「システムコマンド」カテゴリで、3つの独立したテキスト入力としてそれぞれ変更可能
  - `set_system_command_keyword(command, keyword)`（Rust コマンド）は対象コマンドとキーワードを引数に取り、該当フィールドのみを更新する。空文字列はエラーを返し保存しない
  - `validate_unique_keyword(settings, changing, new_value)`（Rust の共通関数）で重複チェックを行う。システムコマンド3キーワード＋クリップボードの呼び出しキーワード（`clipboard_prefix`）＋最近使ったファイル一覧の呼び出しキーワード（`recent_keyword`）＋お気に入りの呼び出しキーワード（`favorite_keyword`）の計6つのうち、`changing`（変更対象の識別子）を除く他のいずれかと大小文字区別なしで完全一致する場合はエラーを返し保存しない。トリム＋小文字化して比較する作法は [favorites-data-model.md](favorites-data-model.md#duplicate-folder-name-validation) の同名フォルダバリデーションでも踏襲されている
- 候補を Enter／クリックした時点では即実行せず、確認モーダル（`pendingCommand` state）を表示する。「実行」ボタン or Enter キーで確定し、`execute_system_command(action)` を呼び出してウィンドウを閉じる（[window-lifecycle.md](window-lifecycle.md#close-window-common-design) の `closeWindow` を経由）
- `execute_system_command(action)`（Rust）自体は確認を行わず、指定されたコマンドを即実行するだけ
  - `shutdown` → `shutdown /s /t 0`
  - `restart` → `shutdown /r /t 0`
  - `sleep` → `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`（スタンバイ。ハイバネートではない）

<a id="prefix-command-candidates"></a>

### プレフィックスコマンド候補表示（フロントエンド）

**拡張ポイントとしての方針**（新機能は候補生成ロジックに1つ追加するだけで既存の表示・選択・frecency に乗る／個別の候補表示 UI を新設しない／キーワードの重複チェック／OFF 時の除外）は、外部設計書 [04-platform-policies.md#prefix-command-extension-point](../external-design/04-platform-policies.md#prefix-command-extension-point) へ移設した。本節には実装の詳細のみを記す。

検索クエリが `/` から始まる場合、登録済みの全プレフィックスコマンド（システムコマンド3つ＋クリップボード履歴＋最近使ったファイル一覧。今後プレフィックス機能が追加された場合も同様に扱う）を、ファイル検索結果とは別枠の候補一覧として表示する（`buildPrefixCommandCandidates`）。

- システムコマンド3つは既存の `matchSystemCommands` をそのまま呼び出し、一致した `SystemCommand` を `PrefixCommand`（`{ keyword, description, kind: "system", action }`）に変換して候補に加える
- クリップボード履歴は `/` + `appSettings.clipboardPrefix` がクエリに前方一致するかを判定し、一致すれば `{ keyword, description: "クリップボード履歴", kind: "clipboard", action: null }` を候補に加える
- 最近使ったファイル一覧は `/` + `appSettings.recentKeyword` が同様に前方一致するかを判定し、一致すれば `{ keyword, description: "最近使ったファイル", kind: "recent", action: null }` を候補に加える
- `appSettings.systemCommandEnabled` / `clipboardEnabled` / `recentFilesEnabled` が `false` の機能はそれぞれ候補生成の対象から除外する
- `calcMode`（数式らしい入力）、または `clipboardMode`／`recentMode`（呼び出しキーワードが完全に入力済みで既に専用モードに切り替わっている状態）の間は候補を生成しない

`PrefixCommand`（`src/types.ts`）は `{ keyword: string, description: string, kind: "system" | "clipboard" | "recent", action: SystemCommandAction | null }`。`keyword` は呼び出し文字列（`/` + キーワード全体、例: `"/shutdown"`）で、frecency のキーにもそのまま使う。

候補は frecency スコアの降順で並び替える（`sortPrefixCommandsByFrecency`）。ファイル検索結果の frecency（[file-search-and-frecency.md](file-search-and-frecency.md#frecency) を参照）と全く同じ関数を再利用し、キーだけを `path` から `keyword` に変えている。

- 使用実績（`count`/`lastUsed`）は候補を Enter／クリックで選択（＝実行）した時点（`selectPrefixCommand`）で記録する。システムコマンドは確認モーダルの確定を待たず、候補を選んだ時点で記録する
- `tauri-plugin-store` の `settings.json` に `"prefixCommandFrecency"` キー（`{ [keyword]: { count, lastUsed } }`）でフロントエンドが直接永続化する

表示（`ResultList.tsx`）：ファイル検索結果・システムコマンド候補と同じリストUI（アイコン＋太字1行目＋グレー2行目）を流用する。1行目に呼び出し文字列（`cmd.keyword`）、2行目に説明文（`cmd.description`）を表示する。アイコンは `kind` によって切り替える（システムコマンドは既存の電源アイコン、クリップボード履歴は `ClipboardPanel` のテキストエントリと同じドキュメントアイコン、最近使ったファイル一覧は時計アイコン）。

ファイル検索結果との関係は排他（`prefixCommandMode = prefixCommandCandidates.length > 0` の間はファイル検索・計算結果・URLエンコード/デコード結果を表示せず、`search_files` も呼ばない）。

選択・実行（`selectPrefixCommand`）：↑↓ で選択、Enter／クリックで直接実行する。

- `kind: "system"` の場合：`requestSystemCommand({ action, label: description })` を呼ぶだけで、既存の確認モーダルにそのまま合流する
- `kind: "clipboard"` または `kind: "recent"` の場合：`setQuery(candidate.keyword)` で検索クエリを呼び出しキーワード全体（例: `"/cb"`、`"/recent"`）に置き換える。これにより次のレンダリングで既存の `clipboardModeFilter`／`recentModeFilter` が自然に一致し、それぞれの専用モードへ切り替わる（専用の遷移コードを新設しない）

前方一致する候補が0件の場合（例: `/xyz`）は `prefixCommandMode` が `false` のままとなり、候補欄を表示せず通常のファイル検索結果を表示する。

## 経緯

<a id="system-mode-integration-history"></a>

### `systemMode`/`systemMatches` から `prefixCommandMode` への統合

旧 `systemMode`/`systemMatches`（システムコマンド専用の候補表示）は、クリップボード履歴・最近使ったファイル一覧のプレフィックス呼び出しが増えるにつれて、同種の「`/` + キーワードで始まる候補一覧」を個別実装するのが非効率になったため、`prefixCommandMode`/`prefixCommandCandidates`/`selectPrefixCommand` という統一の仕組みに統合された。旧 `reboot` キーワードもこのタイミングで `restart` に一本化された。

## 今後の指針

- 新しい "/" プレフィックス機能を追加する場合、`buildPrefixCommandCandidates` に候補生成ロジックを追加するだけで、既存の表示・選択・frecency の仕組みにそのまま乗せられる。個別の候補表示 UI を新設しない
- 呼び出しキーワードの重複チェックは必ず `validate_unique_keyword` を経由させ、新しいキーワードフィールドを追加した場合はこの関数のチェック対象リストに追加する
- 計算結果・URL変換結果のように「本来排他のはずだが許容文字クラスの偶然で排他になっている」機能を追加する場合は、将来の条件緩和に備えて表示順序を明記しておく
