import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// 描画エラーで DOM ごと消えて「何も表示されない」状態になった場合に、devtools の
// コンソールへ確実に記録するための最終防衛ライン（ErrorBoundary が捕捉できない
// 非同期例外・Promise の未処理 rejection 用）。
window.addEventListener("error", (e) => {
  console.error("[global error]", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandled rejection]", e.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
