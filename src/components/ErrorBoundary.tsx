import { Component, ErrorInfo, ReactNode } from "react";

// 描画中の例外を捕捉し、白紙のまま固まって見える状態を避けるためのフォールバック表示。
// /recent のフォーカス復帰時の表示崩れ調査用に、原因が「結果が空配列なだけ」なのか
// 「描画中の例外でコンポーネントツリーごと消えている」のかを切り分けるために追加した。
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] render crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            fontFamily: "sans-serif",
            fontSize: 12,
            color: "#b91c1c",
            background: "white",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            描画エラーが発生しました
          </div>
          <div>{String(this.state.error.stack ?? this.state.error.message)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
