# Plan: Minimal CLI and TOML Config Foundation

## Summary

Implement the next incremental foundation for `mdtoemail`: replace the hello-world CLI with a minimal Bun/TypeScript CLI that parses arguments, loads TOML configuration, reads a Markdown input file, and writes placeholder HTML output.

This step intentionally does **not** integrate Sätteri conversion or final email-safe rendering yet. It establishes the CLI/config/file-I/O base that later conversion work will build on.

## Clarification status

No clarification is needed. The requested next step is clear: keep it simple, use Bun/Node built-ins, add minimal CLI/config behavior, and avoid implementation beyond this planned scope.

## Confirmed requirements and assumptions

- Keep implementation simple; avoid unnecessary files, classes, abstractions, or dependencies.
- Prefer Bun built-in APIs and Node.js standard APIs.
- No new external runtime dependencies.
- Sätteri remains installed/pinned but is not used in this step.
- Use TOML for user configuration.
- No server; this project only converts Markdown to email-compatible HTML.
- This step should establish CLI/config/file I/O only.
- Placeholder HTML output is acceptable for now.
- Auto-loading `mdtoemail.toml` from the current working directory is included as an explicit scope decision for CLI convenience.
- Output overwrites existing files for now, matching simple CLI behavior.

## Relevant research findings

- Bun exposes CLI arguments via `Bun.argv`; Bun docs recommend Node-compatible `util.parseArgs` for structured parsing: <https://bun.com/docs/guides/process/argv>
- Bun supports `node:util` `parseArgs` with option descriptors, short flags, strict mode, and positionals: <https://bun.com/reference/node/util/parseArgs> and <https://nodejs.org/api/util.html#utilparseargsconfig>
- Bun parses TOML strings with `Bun.TOML.parse`; it supports TOML v1.0 and throws on invalid TOML: <https://bun.com/docs/runtime/toml>
- Bun file I/O supports `Bun.file(path).text()`, `Bun.file(path).exists()`, and `Bun.write(...)`: <https://bun.com/docs/runtime/file-io>
- Bun docs recommend Node `fs` APIs for directory operations and Node `path` utilities for path manipulation.
- Bun provides `Bun.escapeHTML`, which should be used for placeholder HTML escaping instead of a custom escaper.

## Current codebase findings

- `AGENTS.md` requires:
  - simple implementation
  - Bun APIs first
  - minimal dependencies
  - incremental build order: CLI/config → Markdown conversion → email-safe rendering → diagnostics
  - TOML config
  - no server
- `PROJECT.md` describes the broader Markdown-to-email roadmap and recommends CLI/config before Markdown conversion.
- `package.json` already includes:
  - `satteri@0.9.4`
  - `typescript`
  - `@types/bun`
  - scripts: `dev`, `test`, `typecheck`, `build`, `compile`
- `tsconfig.json` is strict and currently lacks `resolveJsonModule`.
- `src/cli.ts` currently only prints `Hello from mdtoemail!`.
- Existing tracked source code is minimal, so this change can stay small.

## Chosen implementation strategy

Use two TypeScript files plus one example TOML file:

```txt
src/cli.ts
src/config.ts
mdtoemail.example.toml
```

Also add minimal housekeeping:

```txt
.gitignore
tsconfig.json
```

Rationale:

- `src/cli.ts` owns CLI flow and file I/O.
- `src/config.ts` owns config types, defaults, TOML loading, and validation.
- This avoids a noisy all-in-one CLI file while also avoiding a premature multi-file config layer.
- `mdtoemail.example.toml` documents only currently supported config fields.
- `resolveJsonModule` lets the CLI statically import `package.json` version for `--version` without runtime file reads or hardcoded version drift.
- `.gitignore` avoids tracking generated `dist/` and installed `node_modules/`.

## Alternatives considered

### 1. Keep all logic in `src/cli.ts`

Rejected. It would be smallest initially, but config parsing and validation would quickly make the CLI file harder to read and test.

### 2. Split config into many files

Rejected. Files like `defaults.ts`, `types.ts`, `load.ts`, and `normalize.ts` are premature for the current scope.

### 3. Add a third-party CLI parser

Rejected. Node/Bun `util.parseArgs` is sufficient and matches the minimal-dependency rule.

### 4. Add a schema validation package

Rejected. The config surface is small enough for explicit validation.

### 5. Integrate Sätteri immediately

Rejected for this milestone. Sätteri smoke integration should be the next step after CLI/config/file I/O works.

### 6. Hardcode CLI version

Rejected. Adding `resolveJsonModule` and statically importing `package.json` is simple and avoids drift.

## Implementation tasks

### 1. Add `.gitignore`

Add at least:

```gitignore
node_modules/
dist/
```

Optional but reasonable:

```gitignore
.DS_Store
```

### 2. Update `tsconfig.json`

Add:

```json
"resolveJsonModule": true
```

Reason: allow `src/cli.ts` to statically import `package.json` for `--version` while keeping `bunx tsc --noEmit` happy.

### 3. Add `src/config.ts`

Define a deliberately small initial config:

```ts
export interface Config {
  markdown: {
    gfm: boolean;
    frontmatter: boolean;
    rawHtml: boolean;
  };
  email: {
    containerWidth: number;
  };
  theme: {
    backgroundColor: string;
    containerBackground: string;
    textColor: string;
    linkColor: string;
    fontFamily: string;
    baseFontSize: string;
    lineHeight: string;
    contentPadding: string;
  };
}
```

Notes:

- Do not add `warnings` or `strict` yet because diagnostics are not implemented in this step.
- Do not add broader `PROJECT.md` fields yet (`math`, `directives`, `pretty`, `[styles.*]`, etc.). Add them when needed.
- Keep `mdtoemail.example.toml` aligned exactly with this supported subset.

Add:

```ts
export const defaultConfig: Config = { ... };
export async function loadConfig(configPath?: string): Promise<Config>;
```

`loadConfig` behavior:

1. Start with defaults.
2. If `configPath` is provided:
   - read that exact TOML file
   - fail clearly if missing, unreadable, or invalid
3. If no `configPath` is provided:
   - if `mdtoemail.toml` exists in cwd, load it
   - otherwise use defaults
4. Parse TOML with `Bun.TOML.parse`.
5. Explicitly map snake_case TOML keys to camelCase config fields.
6. Validate known fields and throw clear errors for wrong types.
7. Ignore unknown keys for now.

Snake-case mappings:

```txt
raw_html -> rawHtml
container_width -> containerWidth
background_color -> backgroundColor
container_background -> containerBackground
text_color -> textColor
link_color -> linkColor
font_family -> fontFamily
base_font_size -> baseFontSize
line_height -> lineHeight
content_padding -> contentPadding
```

Validation examples:

```txt
Invalid config: markdown.gfm must be a boolean.
Invalid config: email.container_width must be a number.
Invalid config: theme.background_color must be a string.
```

Implementation guidance:

- Keep validation explicit rather than generic.
- Use small local helpers such as `isRecord(value)` to work cleanly with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Return a complete `Config` object, never a partial config.
- For tests, it may be useful to expose a pure helper such as `mergeConfig(raw: unknown): Config`, but only if it keeps tests simple.

### 4. Replace `src/cli.ts`

Use built-ins:

```ts
import { parseArgs } from "node:util";
import { basename, dirname, extname, join } from "node:path";
import packageJson from "../package.json";
import { loadConfig } from "./config";
```

CLI options:

```txt
-h, --help
-v, --version
-o, --output <file>
-c, --config <file>
```

Parsing:

- Use `parseArgs` with `strict: true` and `allowPositionals: true`.
- Important: handle `Bun.argv` carefully for both `bun run src/cli.ts` and compiled executables.
  - Do not blindly assume `Bun.argv.slice(2)` is correct in all modes.
  - Verify with both direct Bun execution and compiled binary.
  - Prefer a small helper if needed to normalize user args.

Behavior:

- `--help` / `-h`: print help to stdout and exit 0.
- `--version` / `-v`: print `package.json` version and exit 0.
- Conversion requires exactly one positional input file.
- No input: print concise error and help hint to stderr, exit non-zero.
- More than one input: print concise error and help hint to stderr, exit non-zero.
- Unknown flags or missing option values: catch `parseArgs` errors, print concise error and help hint, exit non-zero.

Input/output:

- Read Markdown input with `Bun.file(input).text()`.
- Catch file read errors and print a clean CLI error, not a stack trace.
- Determine output path:
  - if `--output` is passed, use it
  - otherwise derive output from input:
    - `welcome.md` → `welcome.html`
    - `welcome.markdown` → `welcome.html`
    - `welcome` → `welcome.html`
- Write output with `Bun.write(output, html)`.
- Catch output write errors and print a clean CLI error.
- Print `Wrote <output>` to stdout on success.

Placeholder HTML:

- Generate a simple full HTML document.
- Use theme config values for observable output.
- Put escaped Markdown inside `<pre>`.
- Use `Bun.escapeHTML(markdown)` for escaping.

Example placeholder shape:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title></title>
  </head>
  <body style="margin:0;background:#f4f4f4;color:#222222;font-family:Arial, Helvetica, sans-serif;">
    <pre># escaped markdown</pre>
  </body>
</html>
```

This is not final email rendering; it only proves config and file I/O work.

### 5. Add `mdtoemail.example.toml`

Keep it aligned with the currently supported subset:

```toml
[markdown]
gfm = true
frontmatter = true
raw_html = false

[email]
container_width = 600

[theme]
background_color = "#f4f4f4"
container_background = "#ffffff"
text_color = "#222222"
link_color = "#2563eb"
font_family = "Arial, Helvetica, sans-serif"
base_font_size = "16px"
line_height = "1.5"
content_padding = "32px"
```

Do not include future config fields yet; otherwise users may assume unsupported keys work.

### 6. Add `test/config.test.ts`

Even though the implementation should stay small, config loading/normalization is easy to regress and should be tested now.

Use `bun:test`.

Test cases:

1. Defaults are returned when no config file exists.
2. Full TOML override maps snake_case keys to camelCase config fields.
3. Partial override preserves unspecified defaults.
4. Invalid known field type is rejected with a clear error.
5. Unknown keys are ignored.

Testing note:

- Prefer testing pure config merge/normalization helpers if exposed.
- For file-based loading, use temporary files under a temp directory to avoid accidental cwd `mdtoemail.toml` auto-load interference.

## Files likely to change

```txt
.gitignore
mdtoemail.example.toml
src/cli.ts
src/config.ts
test/config.test.ts
tsconfig.json
```

## User-facing CLI interface

```txt
Usage: mdtoemail [options] <input.md>

Options:
  -o, --output <file>   Output HTML file
  -c, --config <file>   TOML config file
  -h, --help            Show help
  -v, --version         Show version
```

Note: `-v` means version for now. If a future verbose mode is added, use a different flag such as `--verbose` without `-v`, or revisit this choice.

## Testing and verification plan

### Automated

```bash
bun test
bun run typecheck
bun run build
```

### Manual CLI verification

```bash
bun run src/cli.ts --help
bun run src/cli.ts --version
printf '# Hello\n\nWorld' > /tmp/mdtoemail-test.md
bun run src/cli.ts /tmp/mdtoemail-test.md -o /tmp/mdtoemail-test.html
cat /tmp/mdtoemail-test.html
cp mdtoemail.example.toml /tmp/mdtoemail.toml
bun run src/cli.ts /tmp/mdtoemail-test.md --config /tmp/mdtoemail.toml -o /tmp/mdtoemail-config-test.html
```

### Error cases

```bash
bun run src/cli.ts
bun run src/cli.ts --unknown
bun run src/cli.ts /tmp/mdtoemail-test.md --config /tmp/missing.toml
```

Expected:

- help/version succeed
- valid conversion writes HTML
- placeholder HTML escapes Markdown
- custom config affects output styles
- missing input/unknown flag/missing config fail cleanly without stack traces
- typecheck/build pass

### Compiled binary verification

Because standalone executable behavior can differ from `bun run` argument layout, verify the compiled binary in this step:

```bash
bun run compile
./dist/mdtoemail --help
./dist/mdtoemail --version
./dist/mdtoemail /tmp/mdtoemail-test.md -o /tmp/mdtoemail-compiled-test.html
```

Expected:

- compiled binary parses args correctly
- first positional input is not dropped
- output is written successfully

## Risks, edge cases, and mitigations

### Argument slicing differs between Bun execution modes

Risk: `Bun.argv` shape may differ between `bun run src/cli.ts` and a compiled executable.

Mitigation:

- Do not hardcode assumptions without testing both modes.
- Include compiled binary verification now.

### Stack traces for user-facing file errors

Risk: uncaught `Bun.file(...).text()` or `Bun.write(...)` errors produce stack traces.

Mitigation:

- Wrap input read, config read, TOML parse, and output write in explicit error handling.
- Print concise messages and set non-zero exit code.

### Config schema divergence from `PROJECT.md`

Risk: broader future config options are documented in `PROJECT.md`, but this step supports only a subset.

Mitigation:

- Keep `mdtoemail.example.toml` limited to supported fields.
- Add broader fields only when used.
- Ignore unknown keys for now to avoid breaking future-compatible config snippets.

### Auto-loading cwd config

Risk: auto-loading `mdtoemail.toml` can surprise tests or users running commands in a directory with an existing config.

Mitigation:

- Document this behavior in help text or README later.
- Keep config tests isolated in temp directories or test pure normalization helpers.

### Output overwrite

Risk: `Bun.write` overwrites existing output files.

Mitigation:

- Accept for now as simple CLI behavior.
- Consider a future `--no-overwrite` or `--force` only if needed.

## Claude review notes incorporated

The draft plan was reviewed with the Claude CLI. Useful feedback incorporated:

- Avoid assuming `Bun.argv.slice(2)` works for both `bun run` and compiled binaries.
- Add compiled binary verification to catch argument-layout differences.
- Add `resolveJsonModule` and statically import `package.json` instead of hardcoding version.
- Require clean file/config/output error handling rather than stack traces.
- Use `Bun.escapeHTML` instead of a custom escaper.
- Add `test/config.test.ts` now because config normalization is regression-prone.
- Keep supported config subset visibly aligned with `mdtoemail.example.toml`.
- Add `.gitignore` housekeeping.

## Next milestone after this

Sätteri smoke integration:

1. Map `Config.markdown` to Sätteri `features`.
2. Convert Markdown via `markdownToHtml` initially.
3. Wrap the result in the placeholder/email shell.
4. Inspect output for headings, links, images, tables, task lists, raw HTML, and escaping behavior.
5. Decide whether to proceed with `markdownToHtml` + plugins or `markdownToHast` + custom renderer for the next phase.

## Remaining open questions

None. Assumptions to keep in mind:

- Cwd `mdtoemail.toml` auto-load is desired for convenience.
- Existing output files may be overwritten.
- This milestone intentionally produces placeholder HTML, not final email-compatible rendered Markdown.
