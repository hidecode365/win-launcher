/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ui: {
          text: "#374151",
          "text-strong": "#1f2937",
          muted: "#6b7280",
          selected: "#3b82f6",
          hover: "#f3f4f6",
          "hover-subtle": "#f9fafb",
          surface: "#ffffff",
          border: "#e5e7eb",
          focus: "#60a5fa",
          action: "#3b82f6",
          "action-hover": "#2563eb",
          disabled: "#e5e7eb",
          "disabled-text": "#9ca3af",
        },
      },
      spacing: {
        "ui-row-x": "1rem",
        "ui-row-y": "0.5rem",
        "ui-item-y": "0.625rem",
        "ui-control-x": "0.75rem",
        "ui-control-y": "0.25rem",
        "ui-control-y-standard": "0.375rem",
      },
      fontSize: {
        "ui-body": ["0.875rem", { lineHeight: "1.25rem" }],
        "ui-meta": ["0.75rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};
