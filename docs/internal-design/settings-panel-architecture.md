# 設定画面の共通アーキテクチャ

対象コード: `src/components/SettingsPanel.tsx`、`src/components/SettingsIndent.tsx`／`SettingsGroup.tsx`／`SettingsSaveBar.tsx`、`src/hooks/useSettingsDraft.ts`、各 `src/components/XxxSettings.tsx`。

横断アーキテクチャ系のファイル。新しい設定タブ・設定項目を追加する場合は、まずこのファイルのレイアウト・保存パターンに乗せられないかを検討すること。

## 現在の設計

<a id="settings-tabs-list"></a>

### 設定パネルのタブ構成（正本）

設定パネルは左にカテゴリナビ、右に選択中カテゴリの内容を表示するタブ構成（`SettingsPanel` 内でタブ選択状態をローカル `useState` 管理）。カテゴリは以下の順：

全般／ファイル検索／お気に入り／パス貼り付け／計算・変換／システムコマンド／Web検索／クリップボード／最近使ったファイル／OCR／このアプリについて

**この箇条書きがカテゴリナビ一覧の正本である。** タブを追加・削除・改名した場合、以下すべてを同時に更新すること（詳細は CLAUDE.md「変更時の同期チェックリスト」節を参照）：

- コード：`SettingsPanel.tsx` の `SettingsTab` 型・`SETTINGS_TABS` 配列・分岐、対応する `XxxSettings.tsx`
- `00-requirements.md`「設定画面」節のカテゴリ一覧
- この節（正本）
- CLAUDE.md のディレクトリ構成図（タブの実体ファイルのみ。共通コンポーネントは対象外）

設定パネルは検索ボックス右の歯車アイコンのクリック、または `Ctrl+,` で開く。表示中は `Ctrl+,` を再実行しても何もせず、`Esc` または閉じるボタンで検索 UI に戻る。ショートカットは input 要素のローカル `onKeyDown` ではなく、`window` への `keydown` イベントリスナー（`useEffect`）で一括処理する。設定内の詳細ダイアログ表示中は、登録済みのEscapeハンドラが先にそのダイアログだけを閉じ、次のEscapeで設定画面を閉じる。設定変更後（パネルを閉じた時点）に検索結果を再評価する。

<a id="settings-persistence-schema"></a>

### 永続化スキーマ（`settings.json`）

**「永続化は単一のストア（`settings.json`）に集約する」という方針と、Rust コマンド経由／JS の store API 直接という2経路の使い分け**は、外部設計書 `external-design/04-platform-policies.md#settings-persistence-policy` へ移設した。

**本節のフィールド一覧は意図的に内部設計書側へ残している**（コードから読み取れる派生情報のため、外部設計書へ置くと設定追加のたびに PO レビューと同期漏れが発生する。詳細は移設先の注記を参照）。以下が現在の一覧：

- `folders: { path, enabled, maxDepth, includeFolders, extensionFilterMode, blacklistExtensions, whitelistExtensions }[]`（ファイル検索カテゴリの検索フォルダ一覧。フォルダごとの詳細設定は [file-search-and-frecency.md](file-search-and-frecency.md) を参照）
- `appSettings: { hotkey, fileSearchEnabled, calcEnabled, systemCommandEnabled, shutdownKeyword, restartKeyword, sleepKeyword, webSearchEnabled, copyWithComma, clipboardEnabled, clipboardPrefix, clipboardMaxItems, ocrEnabled, checkUpdateOnStartup, urlConvertEnabled, urlConvertKeepSpaceEncoded, recentFilesEnabled, recentKeyword, recentMaxAgeDays, recentMaxResults, recentIncludeFolders, recentExtensionFilterMode, recentBlacklistExtensions, recentWhitelistExtensions, pathPasteEnabled, pinEnabled, favoriteEnabled, favoriteKeyword }`。ON/OFF はデフォルト全て `true`、`hotkey` のデフォルトは `Alt+Space`、`shutdownKeyword`/`restartKeyword`/`sleepKeyword` のデフォルトはそれぞれ `"shutdown"`/`"restart"`/`"sleep"`、`clipboardPrefix` のデフォルトは `"cb"`、`clipboardMaxItems` のデフォルトは `50`、`recentKeyword` のデフォルトは `"recent"`、`favoriteKeyword` のデフォルトは `"favorite"`。いずれのキーワードも `"/"` を固定の区切り文字として先頭に付与したうえで検索クエリと前方一致判定する（`"/"` 自体は設定で変更不可）。6つのキーワード（shutdown/restart/sleep/clipboard/recent/favorite）は互いに重複できない（`validate_unique_keyword`。詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md) を参照）。フィールドの並び順は `src/types.ts` の `AppSettings` interface の宣言順と一致させている
- `frecency: { [path]: { count, lastUsed } }`（設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。詳細は [file-search-and-frecency.md](file-search-and-frecency.md) を参照）
- `prefixCommandFrecency: { [keyword]: { count, lastUsed } }`（詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md) を参照）
- `clipboardHistory: ClipboardTextEntry[]`（詳細は [clipboard-and-ocr.md](clipboard-and-ocr.md) を参照）
- `windowSize: { width, height }`（詳細は [window-and-hotkey.md](window-and-hotkey.md) を参照）
- `clipboardPaneWidth: number`（詳細は [clipboard-and-ocr.md](clipboard-and-ocr.md) を参照）
- `favorites: Vec<FavoriteNode>`（詳細は [favorites-data-model.md](favorites-data-model.md) を参照）

各タブに含まれる設定項目・その仕様は 00-requirements.md「設定画面」節の各カテゴリの記述を参照（正本は 00-requirements.md）。ファイル検索タブの検索フォルダパステキストのクリック可能化は、既存の `launch_file` コマンド（`ShellExecuteW` でディレクトリパスを開くと Explorer が起動する）を `invoke` で呼ぶ実装で実現しており、追加の Rust コマンドや権限は不要である。

各 ON/OFF トグル・設定値は Rust コマンド（`set_file_search_enabled` 等）で即時保存し、フロントエンドはレスポンスの `AppSettings` で state を更新する。フロントエンドは `appSettings` をアプリ起動時（マウント時）に `get_app_settings` で取得し、検索 UI 側のモード判定に反映する。OFF の機能は対応する Tauri コマンド自体を呼び出さない・表示しない。

<a id="indent-and-group"></a>

### 階層構造・グループ見出しの共通コンポーネント

**縦ラインによる区切りは、設定画面のどの箇所でも使用しない。** カード背景・左端の縦ラインは使わず、`gap` による余白の広さだけで区別を表現する。

- **階層構造（インデント）**：`SettingsIndent`（`src/components/SettingsIndent.tsx`）が担う。`pl-7` の左インデントのみを行う薄いラッパーで、各タブは「親 `FeatureToggle`」＋「`SettingsIndent` で包んだ従属設定群」という構成にする
  - `disabled` prop を渡すとグレーアウト・操作不可（`opacity-40 pointer-events-none`）になる。ただしこのグレーアウトは「計算・変換」タブの機能ブロック単位（`FeatureBlock`）でのみ使用する既存挙動を維持したもので、システムコマンド／クリップボード／最近使ったファイル／ファイル検索／OCR の各タブでは `disabled` を渡さず、機能 OFF 時も従属設定は編集可能なまま
  - `className` prop でレイアウト（`flex flex-col gap-*` 等）を上書きできる。ファイル検索タブの検索フォルダ一覧のように `flex-1 min-h-0` を必要とする特殊なレイアウトはこの prop で個別対応する
  - `FeatureBlock`（`src/components/FeatureBlock.tsx`）は内部で `SettingsIndent` を利用する（`FeatureToggle` ＋ `SettingsIndent disabled={!checked}` の組み合わせに委譲）
- **設定グループの表現**：`SettingsGroup`（`src/components/SettingsGroup.tsx`）が担う。要素順は「小見出し → 区切り線 → 説明文（任意）→ 子要素（設定項目）」で、カード背景・左端の縦ラインは使わない。**タブ内で複数の設定項目（または検索フォルダ一覧のような単一のリスト型設定）をまとめて示す見出しは、必ずこのコンポーネントを使うこと**（プレーンな `text-sm font-medium ...` の div を見出し代わりに使わない）
  - 区切り線は小見出しの直下（数px程度の狭い間隔）に配置する。区切り線は `<hr>` ではなく `border-t` を持つ `div` で明示的に描画する（`<hr>` は Tailwind の preflight リセットの影響で意図した太さ・色で描画されず、実際にほぼ視認できなくなる事例があったため）。色は通常の項目間セパレータより濃い `border-gray-300` にする
  - グループ小見出しは、サイズ・太さを通常の項目ラベル（`text-sm font-medium text-gray-800`）と揃え、色のみ一段抑える（`text-gray-700`）
  - `description` prop は省略可能。グループの意味が自明でない場合にのみ使う
  - グループ開始前の余白は、`SettingsGroup` 自身が既定で `mt-8`（32px）を持つことで保証する。`className`（既定 `"mt-8"`）・`contentClassName`（既定 `"mt-3 flex flex-col gap-3"`）で個別に上書きできる

<a id="save-model"></a>

### 保存モデル（一括保存）

- `useSettingsDraft<T>(committedValue, isEqual?)`（`src/hooks/useSettingsDraft.ts`）：テキスト・数値・タグ入力1項目分のドラフト state を管理する共通フック。`[draft, setDraft, isDirty]` を返す。`committedValue`（保存済みの値＝props）が変化するたびドラフトを再同期し、`isDirty` はドラフトと `committedValue` の差分から都度算出する（別 state を持たない）。配列（拡張子タグ等）を扱う場合は第2引数に `arraysEqual`（`src/lib/arrayUtils.ts`）等の等価判定関数を渡す
- `SettingsSaveBar`（`src/components/SettingsSaveBar.tsx`）：タブ末尾に置く単一の「保存」ボタン＋「未保存の変更があります」表示＋エラー表示をまとめた共通コンポーネント。`isDirty` が `false` の間はボタンを無効化する
- 各タブは複数の `useSettingsDraft` を束ね、`isDirty`（OR）と `handleSave`（ダーティなフィールドだけを対象コマンドへ直列で保存）をタブコンポーネント側に実装する。直列保存は「ダーティな項目を先頭から順に保存し、いずれかが失敗した時点で打ち切る」方式で統一している（クリップボード／最近使ったファイルのように複数フィールドが単一のエラー文字列 state を共有するタブで、後続フィールドの保存成功が先行フィールドの失敗表示を上書き・消去してしまう事故を避けるため）。この直列保存を可能にするため、対象の `set_*` 系フックコールバック（`setSystemCommandKeyword` / `setClipboardPrefix` / `setClipboardMaxItems` / `setRecentKeyword` / `setRecentMaxAgeDays` / `setRecentMaxResults` / `setRecentDisplaySettings` / `setFolderSettings` / `setHotkey`）は、**成功時は `null`、失敗時はエラーメッセージ文字列（`Promise<string | null>`）を返す**契約に統一している
- トグル・チェックボックス・ラジオボタンは操作した時点で即時保存する（`onChange` から直接 `set_*` を呼ぶ）。「最近使ったファイル」タブの「フォルダを対象に含める」トグルは、同じグループ内の拡張子フィルタリング（タグ入力＝一括保存対象）とは独立して即時保存する（トグル変更時は拡張子フィルタリングの**保存済み**の値をそのまま使って保存し、未保存のタグ編集内容を巻き込まない）
- タブ切り替え時の未保存変更の破棄は追加コードなしで実現している：`SettingsPanel` は選択中のタブのみを条件付きレンダリングしており（他タブは unmount される）、`useSettingsDraft` のドラフト state はタブコンポーネントのローカル state のため、タブ切り替え時の unmount で自動的に破棄される

<a id="error-state-location"></a>

### エラー状態の保持場所（設計原則）

バリデーションエラー（保存失敗時のメッセージ）は、**そのエラーを表示するタブ／モーダルコンポーネント自身のローカル state として保持する。** `App.tsx` の `useSettings`/`useHotkey` のようなタブより上位のフックには一切持たせない。

`FolderDetailSettingsModal`（検索フォルダの詳細設定ダイアログ）のレイアウト・保存ボタンの配置は本節の共通レイアウトルールの対象外で、モーダル自身の「保存」「キャンセル」ボタンによる一括保存を維持するが、このエラー保持の原則はこのモーダルにも適用されている（詳細は [file-search-and-frecency.md](file-search-and-frecency.md) を参照）。

「全般」タブ・「このアプリについて」タブは、タブ全体を表す単一の ON/OFF 機能が存在しないため、親 `FeatureToggle` ＋ `SettingsIndent` の構成は採用していない。「全般」タブのホットキーは専用の「保存」ボタンをタブ末尾の `SettingsSaveBar` に置き換える形で一括保存モデルへ統一した。「起動ホットキー」の見出しも他タブと表現を揃えるため `SettingsGroup`（`className=""` で既定の `mt-8` を打ち消し、タブ先頭要素として不要な余白が生まれないようにしている）でラップしている。

ホットキーの入力コントロール（修飾キー Ctrl/Alt/Shift/Win のチェックボックス群＋通常キーのプルダウン＋現在の組み合わせのプレビュー表示）は `flex flex-wrap` の1行レイアウトに統一している（配置順は Ctrl → Alt → Shift → Win → プルダウン → プレビュー）。修飾キーのチェックボックス群とプルダウン＋プレビューのグループは、外側コンテナの `gap-4`（修飾キー同士の間隔と同じ量）のみで区切る（`border-l` は使わない。経緯は次項）。

## 経緯

<a id="settings-tab-list-duplication-incident"></a>

### 設定画面カテゴリナビ一覧の重複事例

設定画面のカテゴリナビ一覧が2箇所に重複して存在し、互いに異なる不完全なリストになっていた事例があった。これが CLAUDE.md 全体の「変更時の同期チェックリスト」節（コードから読み取れる派生情報を複数箇所に独立して書かない、という原則）が新設される直接のきっかけになった。この節冒頭の「設定パネルのタブ構成（正本）」は、この教訓を踏まえて正本を1箇所に定めたものである。

<a id="error-state-incident"></a>

### エラー状態がタブ切り替えを跨いで残り続けた不具合

ドラフト state をタブコンポーネントのローカルに統一した際、エラー state だけは `useSettings.ts`/`useHotkey.ts`（`App.tsx` で1度だけマウントされ、`SettingsPanel` が開いている間ずっと生き続ける）に取り残されていた。その結果、例えば「クリップボード」タブで「最大保持件数」に不正な値を入力・保存してエラーを表示させたあと、別タブへ切り替えて戻ってきても、そのエラーメッセージが消えずに残る不具合があった（`clipboardSettingsError` はタブが unmount されても影響を受けない、タブより上位の state だったため）。

**横並び調査の結果**：同一パターン（バリデーションエラーが `useSettings.ts`/`useHotkey.ts` 側の state として保持され、対応する `reset*Error` 関数が `App.tsx` の `closeSettings`（パネルを閉じた時のみ）からしか呼ばれない）が、`hotkeyError`（全般タブ）／`clipboardSettingsError`（クリップボードタブ）／`recentSettingsError`（最近使ったファイルタブ）／`systemCommandKeywordErrors`（システムコマンドタブ）／`folderSettingsError`（フォルダ詳細設定モーダル）の**5箇所全てに共通して存在していた**（`folderSettingsError` は、モーダルを開く直前に呼び出し元が明示的に `onResetFolderSettingsError()` を呼ぶ個別対応が既に入っていたため症状は表面化していなかったが、同じ構造的弱さを抱えていた）。

**原因の性質の判定**：特定のタブの実装ミスではなく、「エラー state の保持場所」というこの設定画面全体の設計に共通する構造的な弱さと判定した。ドラフト state は既にタブローカルに統一されていた（unmount で自動破棄される）のに対し、エラー state だけが取り残されていたという非対称性がある以上、1タブだけを個別に直しても他の4箇所が同じ形で再発するのは確実であり、全体設計の見直しを行った。

**検討した設計案**：

1. `SettingsPanel` のタブ切り替えハンドラで全エラー state の `reset*Error` をまとめて呼ぶ（対症療法。新しいタブ・新しいエラー state を追加するたびに、この1箇所への追加登録を手動で行うことを求め続ける必要があり、"忘れたら同じ不具合が再発する" という構造が残る）
2. **エラー state 自体をタブ／モーダルコンポーネントのローカル state に変更する**（ドラフト state と同じ mount ライフサイクルに乗せることで、"unmount されたら消える" という既に信頼されている仕組みだけで自動的に正しくなる）

(2) を採用した。理由：(1) は場当たり的な追加登録を要求し続ける点で「モグラ叩き」の再発を構造的に防げないのに対し、(2) は「エラーの寿命は、それを表示する UI の寿命と一致するべき」という単純な原則に沿っており、今後 SettingsPanel に新しいタブ・新しい保存項目が追加された場合も、単に `useState` をそのタブ内に置くという通常の実装パターンに従うだけで自動的に正しい挙動になる。

**適用した変更**：`useSettings.ts`/`useHotkey.ts` 側の `xxxError` state・`setXxxError`・`resetXxxError` を全廃し、対応する `set_*` コールバックの戻り値を `Promise<boolean>` から `Promise<string | null>`（成功時 `null`、失敗時エラーメッセージ）に変更した。呼び出し元はそれぞれ `useState<string | null>` でエラーをローカルに保持し、`handleSave` が戻り値を見て `setError` する。`App.tsx` の `closeSettings` から5つの `reset*Error` 呼び出しをすべて削除した。

**副次的な単純化**：`FolderDetailSettingsModal` は `detailTarget` が `null` → フォルダオブジェクトに変わるたびに新規マウントされる（フォルダ→別フォルダへ直接遷移することはなく、必ず一度 `null` を経由する）ため、エラー state をモーダル自身のローカルに持たせるだけで「モーダルを開くたびにエラー表示がリセットされる」が自動的に成り立つ。これにより、以前 `FileSearchSettings.tsx` の歯車アイコンの `onClick` にあった `onResetFolderSettingsError()` の明示呼び出しが不要になり削除できた。

### `border-l` による区切りを撤回した経緯

「全般」タブのホットキー設定で、修飾キー群とプルダウンの境目を `border-l`（縦の区切り線）＋左右の余白（`ml-6 pl-6`）で明示していた時期があったが、間隔が開きすぎて「ひとつのホットキー設定」に見えなくなったこと、また縦ラインによる区切りを使わないという本節冒頭の共通方針に反することから、`gap` のみの表現に戻した。

## 今後の指針

- 設定パネルのタブを追加・削除・改名する場合は、[settings-tabs-list](#settings-tabs-list) を含む全箇所（コード・00-requirements.md・CLAUDE.mdディレクトリ構成図）を同時に更新する。コードから読み取れる派生情報を、正本以外の箇所に重複して書かない
- 新しい設定項目を追加する場合、テキスト・数値・タグ入力は `useSettingsDraft` ＋ `SettingsSaveBar` の一括保存パターンに乗せ、トグル・チェックボックス・ラジオボタンは即時保存のパターンに乗せる。どちらのパターンにも当てはまらない独自の保存 UI を新設しない
- バリデーションエラーは常にそれを表示するコンポーネント自身のローカル state として持つ。タブより上位のフック（`useSettings`/`useHotkey` 等）にエラー state を持たせない。`set_*` 系フックコールバックは「成功時 `null`、失敗時エラーメッセージ文字列」という `Promise<string | null>` の契約に統一する
- 設定画面のどの箇所にも縦ラインによる区切り（`border-l`）を使わない。グループ・項目間の区切りは `gap` の広さ、または `SettingsGroup` の見出し＋横罫線で表現する
