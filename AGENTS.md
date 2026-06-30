# Project Rules

- Keep the implementation simple. Avoid unnecessary abstractions, layers, files, classes, or indirection.
- Start with small, focused modules. Split files only when code clearly becomes hard to maintain.
- Prefer Bun built-in APIs wherever practical, including file I/O, TOML parsing, tests, scripts, builds, and CLI/runtime features.
- Prefer standard Node.js APIs where Bun built-ins are not a good fit.
- Avoid external packages unless they provide clear, substantial value.
- Sätteri is the chosen Markdown engine; keep other dependencies minimal.
- Build the project incrementally: first CLI/config basics, then Markdown conversion, then email-safe rendering, then diagnostics.
- Do not add a server. This project only converts Markdown to email-compatible HTML.
- Use TOML for user configuration.
- Keep output conservative and email-client-friendly: inline styles, simple HTML/CSS, table-based outer layout.
