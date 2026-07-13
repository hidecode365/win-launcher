## v0.3.4

- The URL encode/decode auto-detection feature now only activates when the input starts with `http://` or `https://`. Previously, any input containing non-ASCII characters (e.g. a plain Japanese search term) would trigger an encode result, pushing more relevant results (like file matches) further down the list. Restricting the feature to URL-like input eliminates this noise.
