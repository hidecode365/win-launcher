## v0.4.0

- Calculator now supports parentheses `( )` for explicit operator precedence (e.g. `(1+3)/3`, `2*(3+4)`).
- Calculation results and URL encode/decode results are now shown alongside file search results instead of replacing them, so you can see both at once.
- System commands (shutdown / restart / sleep) and clipboard history are now invoked with an explicit prefix (`/shutdown`, `/restart`, `/sleep`, `/cb`). Each command's keyword can be customized individually in Settings.
- Typing `/` now shows a list of available prefix commands, ranked by how often you use them.
