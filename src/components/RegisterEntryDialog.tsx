import { useEffect, useRef, useState } from "react";
import { CreateFolderResult, RegisterFolderOption } from "../types";

// ★（お気に入り）・ノート（メモ、段階5で実装予定）の登録で共通利用する想定の
// 登録ダイアログ。「表示名」「保存先フォルダ（プルダウン）」「新規フォルダ作成」の
// 3要素のみを扱う汎用コンポーネントとし、「お気に入り」「メモ」固有の文言・
// ロジックは一切持たない（呼び出し側が title・folderOptions・保存/フォルダ作成の
// コールバックを props で与える）。00-requirements.md「お気に入り機能」節
// 「登録ダイアログ」を参照。
//
// オーバーレイのスタイルは既存の FolderDetailSettingsModal / SystemCommandModal と
// 同じ `absolute inset-0 z-10` パターンを踏襲する。
export function RegisterEntryDialog({
  title,
  initialName,
  folderOptions,
  initialFolderId,
  onCancel,
  onSave,
  onCreateFolder,
}: {
  title: string;
  initialName: string;
  folderOptions: RegisterFolderOption[];
  initialFolderId: string;
  onCancel: () => void;
  onSave: (name: string, folderId: string) => void;
  onCreateFolder: (
    parentId: string,
    name: string
  ) => Promise<CreateFolderResult>;
}) {
  // 呼び出し側は favoriteDialogTarget 等が非 null のときだけこのコンポーネントを
  // 条件付きレンダリングする想定（FolderDetailSettingsModal と同じ「開くたびに
  // 新規マウントされる」前提）。そのため各 state は毎回このマウント時点の props から
  // 初期化するだけでよく、props の変化を追う useEffect は不要（詳細は CLAUDE.md
  // 「設定画面」節「エラー状態の保持場所」を参照。同じ原則をこのダイアログにも適用）。
  const [name, setName] = useState(initialName);
  const [folderId, setFolderId] = useState(initialFolderId);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // ダイアログを開いた瞬間に表示名フィールドへフォーカスし、テキストを全選択状態にする。
  // 400_テスト・バグ修正：このダイアログを開くトリガー（★ボタン）はクリック後
  // それ自身にフォーカスを持つため、ここで確実に表示名欄へフォーカスを奪う必要が
  // ある。App.tsx の handleOcrClose（OCRプレビューを閉じた直後の検索ボックス
  // 再フォーカス）が同じ理由で requestAnimationFrame を挟んでいるのに倣い、ここでも
  // マウント直後の1フレームを待ってから focus() する（マウント直後の同期的な
  // focus() 呼び出しだけでは、ブラウザ既定のクリックによるフォーカス移動と
  // タイミングが競合し、表示名欄へのフォーカスが確実に反映されない場合がある）。
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // 新規フォルダ作成のインライン入力に切り替わった時点でそちらへフォーカスを移す。
  useEffect(() => {
    if (creatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [creatingFolder]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("表示名を入力してください");
      return;
    }
    onSave(trimmed, folderId);
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setFolderError("フォルダ名を入力してください");
      return;
    }
    const result = await onCreateFolder(folderId, trimmed);
    if (result.folder) {
      setFolderId(result.folder.id);
      setCreatingFolder(false);
      setNewFolderName("");
      setFolderError(null);
    } else {
      // 同名フォルダの重複等、Rust側のバリデーションエラーメッセージをそのまま
      // 表示する（表示名が空のときのバリデーションエラー表示と同じ形式）。
      setFolderError(result.error ?? "フォルダの作成に失敗しました");
    }
  };

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onKeyDown={(e) => {
        // Escape はダイアログのみを閉じる（ランチャーウィンドウ自体は閉じない）。
        // Enter は保存するが、IME変換確定のEnterと衝突しないよう変換中
        // （isComposing）は無視する。新規フォルダ作成用の input は自身の
        // onKeyDown で Enter/Escape を stopPropagation して個別に処理するため、
        // ここには伝播してこない。
        //
        // stopPropagation も呼ぶのは、App.tsx の window レベル keydown リスナー
        // （Ctrl+S 等）へこのダイアログのキー操作が漏れ、ダイアログ表示中に
        // 設定画面が開いてしまう等の意図しない相互作用を防ぐため。
        //
        // 400_テスト・バグ修正：フォーカスが「作成」「キャンセル」「+ 新規
        // フォルダ作成」「保存」等の <button> に当たっている状態で Enter を
        // 押すと、本来はブラウザの既定動作としてそのボタン自身の click が
        // 発火するはずだが、このハンドラが無条件に preventDefault ＋
        // handleSave() を実行していたため、常にダイアログ全体の「保存」に
        // 上書きされてしまい、フォーカス中のボタン本来の意味（フォルダ作成・
        // キャンセル等）が握りつぶされる不具合があった（例：インラインの
        // 新規フォルダ名入力欄からTabで「作成」ボタンへ移動しEnterを押すと、
        // フォルダが作成されずダイアログが閉じてしまう）。
        // フォーカスが button 要素（またはその子孫）に当たっている場合、Enter
        // だけはこのハンドラでは何もせず、ブラウザ標準の「フォーカス中の
        // ボタンのclick発火」に処理を譲る（個々のボタンへ同じ内容のonKeyDownを
        // 重複して実装するのではなく、コンテナ側の1箇所でtarget種別を判定する
        // ことで、将来ボタンが増えても同じ確認を漏れなく適用できる）。Escapeは
        // ボタンに対するブラウザの既定動作を持たない（押しても何も起きない）
        // ため、この判定の対象外とし、フォーカス位置によらず常にダイアログを
        // 閉じる。
        const focusedButton =
          e.target instanceof HTMLElement && e.target.closest("button");
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        } else if (
          e.key === "Enter" &&
          !e.nativeEvent.isComposing &&
          !focusedButton
        ) {
          e.preventDefault();
          e.stopPropagation();
          handleSave();
        }
      }}
    >
      <div className="w-96 rounded-xl bg-white p-5 shadow-2xl">
        <div className="text-sm font-medium text-gray-800">{title}</div>

        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1">表示名</div>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400"
            autoComplete="off"
            spellCheck={false}
          />
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </div>

        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1">保存先フォルダ</div>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400 bg-white"
          >
            {folderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {creatingFolder ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    e.preventDefault();
                    setCreatingFolder(false);
                    setNewFolderName("");
                    setFolderError(null);
                  } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.stopPropagation();
                    e.preventDefault();
                    handleCreateFolder();
                  }
                }}
                placeholder="新しいフォルダ名"
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-800 outline-none focus:border-blue-400"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingFolder(false);
                  setNewFolderName("");
                  setFolderError(null);
                }}
                className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              + 新規フォルダ作成
            </button>
          )}
          {folderError && (
            <div className="text-xs text-red-500 mt-1">{folderError}</div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
