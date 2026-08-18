# Project Rules

- Keep the implementation simple. Avoid unnecessary abstractions, layers, files, classes, or indirection.
- Start with small, focused modules. Split files only when code clearly becomes hard to maintain.
- Require Node.js `>=22.18.0` and use npm for package and contributor workflows.
- Keep the package ESM-only. Use TypeScript 7 for independent type checking, tsdown for production builds, Vitest for tests, type-aware Oxlint for linting, and Oxfmt for formatting.
- Use `npm run check` for the complete fast gate. Use `npm run test:candidate` once for the heavier packed-package, CLI, types, and Worker validation.
- Prefer standard Node.js APIs for CLI and filesystem behavior. Keep the library entry free of Node.js built-ins and compatible with Cloudflare Workers without `nodejs_compat`.
- Avoid external packages unless they provide clear, substantial value.
- Use the exact-pinned unified/remark/rehype pipeline; keep other dependencies minimal.
- Respect the measured anti-slop policy: 11 generic rules block, while four boundary-incompatible rules are deliberately off. Do not lint, format, or remediate vendored plugin source under `tools/oxlint/anti-slop/`; follow its provenance guidance for deliberate upgrades.
- Build the project incrementally: first CLI/config basics, then Markdown conversion, then email-safe rendering, then diagnostics.
- Do not add a server. This project only converts Markdown to email-compatible HTML.
- Use TOML for user configuration.
- Keep output conservative and email-client-friendly: inline styles, simple HTML/CSS, table-based outer layout.
