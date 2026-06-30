# Plan: Safe Theme Tokens and Reusable Theme Files

## Summary

Add a complete theming milestone for `mdtoemail`: expand safe theme/layout tokens used by the email renderer and add reusable theme files selected through project config or `--theme`.

The goal is more configurability while preserving conservative, broadly supported email HTML. Users should be able to save and share themes as TOML files, but `mdtoemail` should still control which CSS properties are emitted and reject token values that could inject arbitrary CSS declarations.

This milestone intentionally avoids arbitrary CSS maps such as `[styles.h1] display = "flex"`. It uses explicit, validated tokens that map to known email-safe inline styles.

## Clarification status

No clarification is needed. The user explicitly wants theme configurability and reusable saved themes in the same milestone.

## Confirmed requirements and assumptions

- Use TypeScript and Bun.
- Add no new dependencies.
- Keep implementation simple and incremental, but complete enough to include both token expansion and theme files.
- Preserve existing CLI behavior and current config support.
- Add separate reusable theme files.
- Users can still style directly in the main config file.
- `--theme <name-or-path>` should override the theme selected by config.
- Continue using TOML.
- Keep output conservative and email-client-friendly.
- Do not add arbitrary user-controlled CSS declarations.
- Do not add a server or email sending.
- Do not target standalone binaries.

## Important TOML design finding

A root-level key named `theme = "newsletter"` cannot coexist with the existing `[theme]` table in TOML because both use the same key path.

Therefore, do **not** use this shape:

```toml
theme = "newsletter"

[theme]
link_color = "#..."
```

Use a selector inside the existing `[theme]` table instead:

```toml
[theme]
extends = "newsletter"
link_color = "#..."
```

Rationale:

- Avoids TOML key/table conflicts.
- Keeps all appearance-related config under `[theme]`.
- Allows project configs to select a base theme and override individual tokens in the same table.

## Current codebase findings

- `src/config.ts`
  - `Config.email` currently contains `containerWidth`, `warnings`, `strict`.
  - `Config.theme` currently contains a small set of tokens: colors, font family, base font size, line height, content padding.
  - TOML loading is currently one-pass: defaults plus optional config file.
  - Unknown keys are ignored in normal project config.
- `src/cli.ts`
  - uses `node:util` `parseArgs`.
  - supports `--config`, `--strict`, `--no-warnings`, `--output`, help/version.
  - calls `loadConfig(values.config)` before reading/rendering Markdown.
- `src/email.ts`
  - hardcodes many style values that should become tokens:
    - outer padding `24px 12px`
    - heading colors/font sizes/margins/line heights
    - border color `#dddddd`
    - code background `#f3f4f6`
    - table header background currently coupled to code background
    - list/table/image/pre/blockquote margins and padding
  - uses inline styles only.
  - table wrapper and safe element renderer are centralized.
- `README.md`
  - documents current config and CLI flags.
  - has only a brief theme section.
- `mdtoemail.example.toml`
  - documents the small theme subset.
- `examples/`
  - contains Markdown examples and generated HTML.
  - no theme files yet.

## Chosen implementation strategy

Implement theming in three related pieces:

1. Expand safe tokens in `Config.email` and `Config.theme`.
2. Add theme-file loading with a controlled merge order.
3. Add example theme files and documentation.

### Config model

Normal project config can contain behavior and appearance:

```toml
[markdown]
gfm = true
frontmatter = true
raw_html = false

[email]
container_width = 600
outer_padding = "24px 12px"
warnings = true
strict = false

[theme]
extends = "newsletter"
background_color = "#f7f2ea"
link_color = "#b45309"
```

Theme files should be appearance/layout-only:

```toml
# themes/newsletter.toml
[email]
container_width = 640
outer_padding = "32px 12px"

[theme]
background_color = "#f7f2ea"
container_background = "#ffffff"
text_color = "#1f2933"
heading_color = "#111827"
link_color = "#b45309"
border_color = "#e5d3bd"
table_header_background = "#f9f5ef"
code_background = "#f9f5ef"
font_family = "Arial, Helvetica, sans-serif"
base_font_size = "16px"
line_height = "1.6"
content_padding = "36px"
```

Theme files may only override:

- `[theme]` tokens
- `[email]` layout keys:
  - `container_width`
  - `outer_padding`

Theme files must not override behavior:

- `[markdown]`
- `email.warnings`
- `email.strict`

Theme files also must not include `[theme].extends`; no theme-to-theme inheritance/chaining in this milestone.

### Merge order

Use this order:

1. `defaultConfig`
2. selected theme file, if any
3. project config file values
4. CLI behavior overrides (`--strict`, `--no-warnings`)

This lets a project select a base theme and override specific tokens locally.

Example:

```toml
[theme]
extends = "newsletter"
link_color = "#dc2626"
```

`newsletter` supplies the full base look, and the project config changes only the link color.

### Theme selection

Support both project-config and CLI selection:

```toml
[theme]
extends = "newsletter"
```

```bash
bun run src/cli.ts input.md --theme newsletter
bun run src/cli.ts input.md --theme ./examples/themes/newsletter.toml
```

Precedence:

- `--theme` overrides `[theme].extends`.
- If no theme is selected, use only defaults + project config.

### Theme resolution

Use simple deterministic resolution.

Define a `themeBaseDir`:

- explicit `--config`: directory of the resolved config file path
- no explicit config: current working directory

Resolve all relative theme selectors from `themeBaseDir`, including CLI `--theme`. This keeps config-selected themes and CLI-selected themes consistent.

If the selector looks path-like or ends with `.toml`, treat it as a path:

- starts with `.`
- starts with `/`
- contains `/` or `\`
- ends with `.toml`

Path-like selector resolution:

- absolute path: use as-is
- relative path: resolve from `themeBaseDir`

If the selector is a plain name, resolve it against:

```txt
<themeBaseDir>/themes/<name>.toml
```

Examples:

- `--config ./project/mdtoemail.toml` + `[theme].extends = "newsletter"` loads `./project/themes/newsletter.toml`.
- `--config ./project/mdtoemail.toml --theme newsletter` also loads `./project/themes/newsletter.toml`.
- `--config ./project/mdtoemail.toml --theme ./themes/minimal.toml` loads `./project/themes/minimal.toml`.
- `--theme newsletter` with no config loads `./themes/newsletter.toml` from cwd.

Do not add global theme lookup such as `~/.config/mdtoemail/themes` in this milestone.

## CSS value safety

This is required in this milestone.

Because theme values are inserted into inline `style` attributes, string tokens must be validated to prevent CSS declaration injection. A value like this must be rejected:

```toml
link_color = "blue; background-image: url(https://example.com/track.png)"
```

Otherwise it would inject extra CSS declarations into generated email HTML.

Add a shared validator for style token strings, used for all `[theme]` string tokens and layout style strings such as `email.outer_padding`.

Minimum validation:

- reject ASCII control characters
- reject `;`
- reject `{` and `}`
- reject `/*` and `*/`
- reject case-insensitive `url(`
- reject case-insensitive `expression(`
- cap length, e.g. max 200 characters
- require non-empty strings after trim

Allow normal safe values such as:

- `#2563eb`
- `16px`
- `1.5`
- `90%`
- `0 0 16px 0`
- `Arial, Helvetica, sans-serif`
- `Consolas, Monaco, monospace`

Error example:

```txt
Invalid config: theme.link_color contains unsupported CSS characters or functions.
```

Keep `rawStyleAttribute(...)` as a serializer for property names chosen by the renderer, but never pass unvalidated user style values into it.

## Safe token set

This token set is larger than today but still intentionally bounded. It maps to existing renderer properties and avoids arbitrary CSS.

### Email/layout tokens

Add:

```ts
email: {
  containerWidth: number;
  outerPadding: string;
  warnings: boolean;
  strict: boolean;
}
```

TOML:

```toml
[email]
container_width = 600
outer_padding = "24px 12px"
```

### Theme tokens

Keep existing tokens and add/rename as needed:

```ts
theme: {
  backgroundColor: string;
  containerBackground: string;
  textColor: string;
  headingColor: string;
  mutedTextColor: string;
  linkColor: string;
  borderColor: string;
  tableHeaderBackground: string;
  codeBackground: string;
  blockquoteBorderColor: string;
  fontFamily: string;
  codeFontFamily: string;
  baseFontSize: string;
  smallFontSize: string;
  lineHeight: string;
  contentPadding: string;
  h1FontSize: string;
  h2FontSize: string;
  h3FontSize: string;
  minorHeadingFontSize: string;
  h1LineHeight: string;
  h2LineHeight: string;
  h3LineHeight: string;
  minorHeadingLineHeight: string;
  h1Margin: string;
  h2Margin: string;
  h3Margin: string;
  minorHeadingMargin: string;
  paragraphMargin: string;
  listMargin: string;
  listPadding: string;
  listItemMargin: string;
  blockquoteMargin: string;
  blockquotePadding: string;
  codeFontSize: string;
  codePadding: string;
  preMargin: string;
  prePadding: string;
  preFontSize: string;
  preLineHeight: string;
  hrMargin: string;
  imageMargin: string;
  tableMargin: string;
  tableCellPadding: string;
  footnoteMargin: string;
  footnotePadding: string;
}
```

Notes:

- `mutedTextColor` and `smallFontSize` must be used, not dead config. Use them for GFM footnote `section` styling.
- `tableHeaderBackground` must be separate from `codeBackground` to avoid surprising coupling.
- Some renderer choices intentionally remain hardcoded for now:
  - heading/table header font weight `700`
  - link underline
  - border widths (`1px` table/hr/footnote, `4px` blockquote)
  - image `display:block`, `max-width:100%`, `height:auto`, `border:0`
  - table `width:100%` and `border-collapse:collapse`
  - `pre` overflow handling

Suggested defaults should match current output as closely as possible:

```toml
[email]
outer_padding = "24px 12px"

[theme]
heading_color = "#222222"
muted_text_color = "#666666"
border_color = "#dddddd"
table_header_background = "#f3f4f6"
code_background = "#f3f4f6"
blockquote_border_color = "#dddddd"
code_font_family = "Consolas, Monaco, monospace"
small_font_size = "14px"
h1_font_size = "28px"
h2_font_size = "24px"
h3_font_size = "20px"
minor_heading_font_size = "16px"
h1_line_height = "1.25"
h2_line_height = "1.3"
h3_line_height = "1.35"
minor_heading_line_height = "1.5"
h1_margin = "0 0 20px 0"
h2_margin = "24px 0 16px 0"
h3_margin = "20px 0 12px 0"
minor_heading_margin = "16px 0 8px 0"
paragraph_margin = "0 0 16px 0"
list_margin = "0 0 16px 0"
list_padding = "0 0 0 24px"
list_item_margin = "0 0 8px 0"
blockquote_margin = "0 0 16px 0"
blockquote_padding = "0 0 0 16px"
code_font_size = "90%"
code_padding = "2px 4px"
pre_margin = "0 0 16px 0"
pre_padding = "12px"
pre_font_size = "14px"
pre_line_height = "1.4"
hr_margin = "24px 0"
image_margin = "0 0 16px 0"
table_margin = "0 0 16px 0"
table_cell_padding = "8px"
footnote_margin = "24px 0 0 0"
footnote_padding = "16px 0 0 0"
```

### Theme selector field

Add a project-config-only optional token:

```toml
[theme]
extends = "newsletter"
```

Implementation detail:

- `Config.theme.extends` does not need to exist in the resolved final config used by rendering.
- Treat `extends` as loader metadata.
- `mergeConfig(...)` should validate it as a string when present but ignore it for final rendering.
- `mergeThemeConfig(...)` should reject it in theme files.

## Implementation tasks

### 1. Refactor config loading to support theme selection

Update `src/config.ts` while keeping it a single file for now.

Use a single options-object API. Do not keep dual positional overloads.

```ts
export interface LoadConfigOptions {
  configPath?: string;
  cwd?: string;
  theme?: string;
}

export async function loadConfig(options?: LoadConfigOptions): Promise<Config>;
```

Update all callers/tests from:

```ts
loadConfig(path)
loadConfig(undefined, dir)
```

to:

```ts
loadConfig({ configPath: path })
loadConfig({ cwd: dir })
```

Implementation outline:

1. Resolve `cwd = options?.cwd ?? process.cwd()`.
2. Resolve project config path:
   - if `configPath` is provided, read it and fail if missing/invalid.
   - else read `<cwd>/mdtoemail.toml` if present.
   - else use no project raw config.
3. Determine `themeBaseDir`:
   - explicit config: `dirname(resolve(cwd, configPath))` for relative paths.
   - auto/default: `cwd`.
4. Determine theme selector:
   - CLI/options `theme`, if provided.
   - otherwise raw project config `[theme].extends`, if string.
5. If selector exists, load theme file:
   - resolve by path/name rules.
   - parse TOML.
   - validate as theme file, not full project config.
6. Merge:
   - `defaultConfig`
   - theme raw config, if loaded
   - project raw config, if loaded
7. Return complete resolved `Config`.

Keep error messages clear:

```txt
Could not read theme file "...". ENOENT: ...
Invalid config: theme.extends must be a string.
Invalid theme: markdown is not allowed in theme files.
Invalid theme: theme.extends is not allowed in theme files.
Invalid theme: email.strict is not allowed in theme files.
```

Important integration detail:

- Existing config read error handling special-cases `Invalid config:`. New theme errors should not be wrapped as `Could not read config file ...`.
- Either preserve `Invalid theme:` messages directly or normalize them under `Invalid config:` when thrown from `loadConfig`.
- Tests should assert clean theme validation errors.

### 2. Add declarative field mappings

Avoid dozens of repetitive one-off `setString(...)` calls for theme tokens.

Use explicit mapping tables as the single source of truth:

```ts
const themeStringFields = [
  ["background_color", "backgroundColor"],
  ["container_background", "containerBackground"],
  ["heading_color", "headingColor"],
  // ...
] as const;
```

Then loop:

```ts
for (const [tomlKey, configKey] of themeStringFields) {
  setStyleString(raw.theme, tomlKey, `theme.${tomlKey}`, (value) => {
    config.theme[configKey] = value;
  });
}
```

Keep boolean/number fields explicit because there are few of them.

Benefits:

- Less boilerplate.
- Lower risk of snake_case/camelCase mismatch.
- Easy to run all theme values through the CSS value validator.

### 3. Add merge helpers

Suggested helpers:

```ts
export function mergeConfig(raw: unknown, base?: Config): Config;
function mergeThemeConfig(raw: unknown, base: Config): Config;
function themeSelectorFrom(raw: unknown): string | undefined;
function resolveThemePath(selector: string, baseDir: string): string;
function validateThemeStyleValue(value: string, label: string): string;
```

Important:

- `mergeConfig(raw, base = defaultConfig)` must start with `cloneConfig(base)`, not mutate `base`.
- `cloneConfig` must include all new tokens.
- `mergeThemeConfig` should only accept `[theme]` tokens and allowed `[email]` layout keys.
- Keep unknown keys in normal project config ignored, matching current behavior.
- Theme files are stricter than project configs for behavior sections/keys.

### 4. Extend config types/defaults/mapping

Update `Config` and `defaultConfig` with the token set above.

Validation:

- `container_width`: finite number.
- `warnings` / `strict`: boolean.
- `outer_padding`: validated style string.
- all `[theme]` tokens: validated style string.
- `[theme].extends`: string selector in project config only.

Example validation errors:

```txt
Invalid config: theme.border_color must be a string.
Invalid config: theme.link_color contains unsupported CSS characters or functions.
Invalid config: email.outer_padding contains unsupported CSS characters or functions.
```

### 5. Wire `--theme` into the CLI

Update `src/cli.ts`:

- add parse option:

```ts
theme: { type: "string" }
```

- help text:

```txt
      --theme <name|file>  Theme name from ./themes or TOML theme file
```

- load config with theme override:

```ts
const config = applyCliOverrides(
  await loadConfig({ configPath: values.config, theme: values.theme }),
  values,
);
```

Keep `--theme` independent from `--config`; users can provide either or both.

### 6. Use expanded tokens in `src/email.ts`

Replace hardcoded style values with config tokens.

Examples:

- wrapper outer cell padding:

```ts
padding: config.email.outerPadding
```

- headings:

```ts
color: config.theme.headingColor
font-size: config.theme.h1FontSize
line-height: config.theme.h1LineHeight
margin: config.theme.h1Margin
```

- h4/h5/h6:

```ts
font-size: config.theme.minorHeadingFontSize
line-height: config.theme.minorHeadingLineHeight
margin: config.theme.minorHeadingMargin
```

- code/pre:

```ts
background: config.theme.codeBackground
font-family: config.theme.codeFontFamily
```

- table header:

```ts
background: config.theme.tableHeaderBackground
```

- borders:

```ts
borderColor = config.theme.borderColor
blockquoteBorderColor = config.theme.blockquoteBorderColor
```

- table cells:

```ts
padding: config.theme.tableCellPadding
```

- footnote `section`:

```ts
color: config.theme.mutedTextColor
font-size: config.theme.smallFontSize
```

Preserve current output with default tokens as much as practical.

### 7. Add example themes

Create:

```txt
examples/themes/minimal.toml
examples/themes/newsletter.toml
examples/themes/transactional.toml
```

Do **not** add `examples/themes/default.toml` in this milestone. The built-in defaults are already the default, and a duplicate default file would become a second source of truth.

Guidance:

- `minimal.toml`: white background, narrower spacing, black/gray palette.
- `newsletter.toml`: warmer background, branded link color, more generous spacing.
- `transactional.toml`: crisp neutral style for account/security emails.

Generate themed outputs using existing example Markdown:

```bash
bun run src/cli.ts examples/product-update.md --theme examples/themes/newsletter.toml -o examples/product-update-newsletter.html
bun run src/cli.ts examples/security-notice.md --theme examples/themes/transactional.toml -o examples/security-notice-transactional.html
```

### 8. Update docs

Update `README.md`:

- explain direct `[theme]` tokens in normal config.
- explain reusable theme files.
- explain `[theme].extends`.
- explain `--theme <name-or-path>`.
- explain resolution rules.
- document theme-file restrictions:
  - can contain `[theme]`
  - can contain `[email] container_width` / `outer_padding`
  - must not contain `[markdown]`, `email.strict`, `email.warnings`, or `[theme].extends`
- explain style token safety validation.
- add examples:

```bash
bun run src/cli.ts examples/product-update.md --theme newsletter -o email.html
bun run src/cli.ts examples/product-update.md --theme ./examples/themes/newsletter.toml -o email.html
```

Update `mdtoemail.example.toml` with all supported tokens so users can discover them.

### 9. Tests

#### Config tests

Update `test/config.test.ts`:

- defaults include new tokens.
- full TOML override maps representative new fields.
- partial override preserves defaults.
- invalid token type fails clearly.
- CSS injection values are rejected:
  - `link_color = "blue; display:flex"`
  - `background_color = "url(https://example.com/x.png)"`
- explicit config with `[theme].extends = "newsletter"` loads `themes/newsletter.toml` relative to config file directory.
- `loadConfig({ theme: "minimal", cwd })` loads `<cwd>/themes/minimal.toml`.
- options theme override wins over `[theme].extends`.
- path-like theme selectors work relative to `themeBaseDir`.
- missing theme file fails clearly and names the resolved path.
- theme file with `[markdown]` fails.
- theme file with `email.strict` or `email.warnings` fails.
- theme file with `[theme].extends` fails.
- project config can override a loaded theme token.

#### Email rendering tests

Update/add tests in `test/email.test.ts` or `test/markdown.test.ts`:

- `renderEmailDocument` uses `email.outerPadding`.
- heading styles use theme heading tokens.
- table borders/cell padding/table header background use theme tokens.
- code/pre backgrounds use theme tokens.
- footnote section uses muted/small tokens.

If testing `styleForElement` directly would require exporting internals, avoid that; use `renderMarkdown(...)` for output-level assertions.

#### CLI tests

Update `test/cli.test.ts`:

- `--theme ./path/to/theme.toml` affects output.
- `--theme name` loads from `themes/<name>.toml` relative to config base/cwd.
- `--theme` overrides config-selected `[theme].extends`.
- missing `--theme` fails cleanly and includes the resolved path.

Use temp directories to avoid depending on repository examples.

### 10. Verification

Run:

```bash
bun test
bun run typecheck
bun run build
```

Manual checks:

```bash
bun run src/cli.ts examples/product-update.md --theme examples/themes/newsletter.toml -o examples/product-update-newsletter.html
bun run src/cli.ts examples/security-notice.md --theme examples/themes/transactional.toml -o examples/security-notice-transactional.html
```

Inspect generated HTML for:

- table wrapper remains intact.
- inline styles use theme colors/spacings.
- diagnostics still print for task lists/raw HTML/unsafe links.
- CSS injection values are rejected rather than emitted.
- no arbitrary CSS from theme files is emitted except mapped safe tokens.

## Files likely to change

```txt
src/config.ts
src/cli.ts
src/email.ts
mdtoemail.example.toml
README.md
test/config.test.ts
test/cli.test.ts
test/email.test.ts
test/markdown.test.ts
examples/themes/minimal.toml
examples/themes/newsletter.toml
examples/themes/transactional.toml
examples/product-update-newsletter.html
examples/security-notice-transactional.html
```

Possible:

```txt
PROJECT.md
```

Only update `PROJECT.md` if needed to record the theming design.

## Interface changes

New CLI option:

```txt
--theme <name|file>
```

New project config selector:

```toml
[theme]
extends = "newsletter"
```

New reusable theme files:

```txt
themes/<name>.toml
```

or explicit paths passed to `--theme`.

New config tokens under `[email]` and `[theme]` as listed above.

## Backward compatibility

- Existing config files remain valid.
- Existing `[theme]` values still work.
- Defaults are chosen to preserve existing output as closely as possible.
- Unknown keys in normal project config remain ignored for now.
- Theme files are stricter than project configs to prevent behavior overrides.
- Semicolon/control/function CSS injection values that may previously have been accepted as plain strings are now rejected for style tokens.

## Risks, edge cases, and mitigations

### CSS declaration injection through token values

Risk: A user-controlled token value containing `;` or `url(...)` could inject arbitrary CSS declarations into inline styles.

Mitigation: Add required style value validation for all style tokens and tests for injection rejection.

### TOML selector/table conflict

Risk: `theme = "newsletter"` cannot coexist with `[theme]`.

Mitigation: Use `[theme].extends` for theme selection.

### Over-configurability creates email-unsafe CSS

Risk: Arbitrary CSS would let users generate invalid or poorly supported email output.

Mitigation: Only support explicit safe tokens. Renderer owns property names and structure. Validate values.

### Theme merge order surprises

Risk: Users may expect local config values to override selected theme values.

Mitigation: Use defaults -> theme file -> project config -> CLI overrides, and document it.

### Path resolution confusion

Risk: Named theme vs path-like theme resolution can be unclear.

Mitigation: Resolve both relative to config base/cwd consistently, document rules, and test them.

### Theme file behavior overrides

Risk: A theme file could silently disable warnings or strict mode.

Mitigation: Reject `[markdown]`, `email.warnings`, `email.strict`, and `[theme].extends` in theme files.

### Token set size

Risk: Many tokens make `Config` and `config.ts` verbose.

Mitigation: Use declarative mapping tables for homogeneous theme string fields. Keep renderer token usage straightforward.

### No full semantic CSS validation yet

Risk: Users can provide semantically invalid but syntactically safe values like `font_size = "banana"`.

Mitigation: This is acceptable for this milestone; email clients will ignore invalid property values. Block injection and dangerous functions now; add stricter per-token validators later if needed.

## Alternatives considered

### 1. Only use `--config theme.toml`

Rejected. It mixes behavior config and appearance config and makes it harder to combine project behavior with reusable themes.

### 2. Root-level `theme = "newsletter"`

Rejected because it conflicts with the existing `[theme]` table in TOML.

### 3. Arbitrary `[styles.h1]` maps

Rejected. It is powerful but can easily produce email-unsafe CSS and requires more validation and documentation.

### 4. Built-in runtime theme presets

Rejected for this milestone. Example TOML files are simpler, transparent, and user-editable. Runtime presets can be added later if needed.

### 5. Global theme directory lookup

Rejected for this milestone. `~/.config/mdtoemail/themes` adds platform/path complexity and precedence questions. Project-local themes are enough for now.

### 6. Duplicate default theme file

Rejected. It would duplicate `defaultConfig` and risk drift. Built-in defaults are the default theme.

## Claude review notes incorporated

The draft plan was reviewed with Claude CLI. Useful feedback incorporated:

- Added required CSS token value validation to prevent semicolon/function-based style injection.
- Added `tableHeaderBackground` instead of coupling table header background to `codeBackground`.
- Ensured `mutedTextColor` and `smallFontSize` have a render site via footnote section styling.
- Explicitly listed style choices that remain hardcoded.
- Required `mergeConfig(raw, base)` to clone the provided base.
- Switched fully to an options-object `loadConfig(...)` API instead of dual overloads.
- Made relative theme path resolution consistent against config base/cwd.
- Rejected theme-file `extends` to avoid unplanned theme chaining.
- Removed duplicate `default.toml` example theme to avoid a second source of truth.
- Recommended declarative theme field mappings to avoid excessive repetitive `setString(...)` calls.
- Added tests for CSS injection rejection and theme-file restrictions.

## Open questions

None requiring user input.

Implementation assumptions:

- Reusable themes are TOML files.
- Project config selects a theme via `[theme].extends`.
- `--theme` overrides `[theme].extends`.
- Theme files are appearance/layout-only.
- Style token values receive safety validation but not full semantic CSS validation.
