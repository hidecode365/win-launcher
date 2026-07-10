# WinLauncher

![Readme](docs/screenshot-readme.png)

A fast, keyboard-driven launcher for Windows 11 — built with Tauri v2, React, and Rust.

![WinLauncher](docs/screenshot-search.png)

## Screenshots

| File Search | Settings | Clipboard History | OCR |
| ------------- | ---------- | ------------------ | ---- |
| ![Search](docs/screenshot-search.png) | ![Settings](docs/screenshot-settings.png) | ![Clipboard](docs/screenshot-clipboard.png) | ![OCR](docs/screenshot-ocr.png) |

## Features

- **File Search** — Incremental search across configured folders with frecency-based ranking
- **Calculator** — Type expressions like `1000 + 200` for instant results
- **Clipboard History** — Browse and restore text & image history with `cb`
- **OCR (Image to Text)** — Paste an image (`Ctrl+V`) into the search box to extract text via Windows OCR, with mixed Japanese/English support
- **Web Search** — Search Google directly from the launcher
- **System Commands** — Shutdown, restart, or sleep with confirmation
- **Customizable Hotkey** — Default `Alt+Space`, configurable from settings
- **System Tray** — Runs silently in the background

## Installation

Download the installer from [Releases](https://github.com/hidecode365/win-launcher/releases).

> winget support coming soon

## Usage

| Key | Action |
| ----- | -------- |
| `Alt+Space` | Open / close launcher |
| `↑↓` | Navigate results |
| `Enter` | Launch / execute |
| `Esc` | Close |
| `Ctrl+S` | Open settings |
| `cb` | Open clipboard history |
| `Ctrl+V` (with image) | Extract text from clipboard image via OCR |

## Security Note

Clipboard text history is stored **unencrypted** in plain text on disk. Avoid copying sensitive information (passwords, tokens, etc.) while clipboard history is enabled, or disable the feature from settings if this is a concern.

## Requirements

- Windows 11 (x64)
- No additional runtime required

## Tech Stack

- [Tauri v2](https://tauri.app/)
- React + TypeScript
- Rust
- Tailwind CSS

## License

MIT
