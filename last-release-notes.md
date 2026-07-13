## v0.3.3

- Added a "Keep %20 as-is" option to the URL encode/decode auto-detection feature (Settings → Calculator & Conversion, off by default). When enabled, only the space character (`%20`) is left undecoded during URL decoding — useful for apps that misinterpret a literal space as the end of a URL — while all other `%XX` sequences are still decoded normally. This setting only affects decoding and has no effect on the encode path.
- Added a small label ("Decoded result" / "Encoded result") above the URL encode/decode result in the search list, making it clear which operation produced the displayed text.
