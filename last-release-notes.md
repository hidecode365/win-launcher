## v0.3.2

- Added URL encode/decode auto-detection in search results: pasting a URL-encoded string decodes it, and pasting text containing non-ASCII characters (e.g. Japanese) encodes it using `encodeURI`-equivalent behavior (preserving URL structural characters like `:`, `/`, `?`, `#`, etc.). Results can be copied to clipboard via Enter.
- Renamed the "Calculator" settings category to "Calculator & Conversion" to accommodate the new URL encode/decode feature as a sibling toggle, and restructured the settings UI into reusable "feature block" groups (main toggle + indented sub-settings, grayed out when disabled).
- Fixed a bug where the calculator's expression detection (`/[+\-*/]/` regex) was too permissive and misfired on URLs and other strings containing digits and slashes, blocking the URL decode result from being shown.
