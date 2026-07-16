import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // `npm run tauri build`（vite の command は "build"）でのみ Terser minify に切り替え、
  // console.debug/console.log の呼び出しを丸ごと削除する。console.error/console.warn は
  // 対象外（本番でも実害の把握のため残す）。`npm run tauri dev`（command は "serve"）では
  // この設定自体が適用されないため、開発時のログ出力・動作には影響しない。
  build:
    command === "build"
      ? {
          minify: "terser",
          terserOptions: {
            compress: {
              pure_funcs: ["console.debug", "console.log"],
            },
          },
        }
      : undefined,
}));
