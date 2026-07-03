# mdtoemail

Fast Bun + TypeScript CLI for converting Markdown into conservative, email-friendly HTML.

`mdtoemail` is intentionally narrow: **Markdown file in, standalone HTML file out**. It does not send email, track opens/clicks, run a server, manage webhooks, or handle provider-specific delivery concerns.

## What it does

- renders Markdown with pinned `satteri@0.9.4`
- wraps output in a table-based email document
- emits inline styles and legacy table attributes for broad client compatibility
- sanitizes/normalizes generated HTML
- supports safe TOML theme tokens and reusable theme files
- reports diagnostics and supports strict mode

## Agent quickstart

Use this section when an AI agent needs to convert Markdown into email HTML with this tool.

1. Install dependencies if needed:

   ```bash
   bun install
   ```

2. Convert a Markdown file:

   ```bash
   bun run src/cli.ts input.md -o email.html
   ```

3. Use a config file when custom tokens or strict/warning settings are needed:

   ```bash
   cp mdtoemail.example.toml mdtoemail.toml
   bun run src/cli.ts input.md --config mdtoemail.toml -o email.html
   ```

4. Use a reusable theme when only appearance/layout should change:

   ```bash
   bun run src/cli.ts input.md --theme ./examples/themes/newsletter.toml -o email.html
   ```

5. For safer CI-style conversion, fail before writing output if warning diagnostics occur:

   ```bash
   bun run src/cli.ts input.md --strict -o email.html
   ```

Agent usage notes:

- Input must be Markdown; output is a standalone HTML file.
- Read stderr diagnostics after conversion; they explain removed, escaped, or compatibility-sensitive content.
- Prefer `--strict` when producing HTML for automated pipelines.
- Do not add sending, tracking, provider webhooks, or server behavior around this tool.
- Customize styling through TOML theme tokens, not arbitrary CSS.

## Requirements

- Bun 1.3+

## Setup

```bash
bun install
```

Run from source:

```bash
bun run src/cli.ts input.md -o email.html
```

Development shortcut:

```bash
bun run dev -- input.md -o email.html
```

## Usage

```bash
bun run src/cli.ts [options] <input.md>
```

Options:

```txt
-o, --output <file>      Output HTML file
-c, --config <file>      TOML config file
    --theme <name|file>  Theme name from ./themes or TOML theme file
    --strict             Fail on warning diagnostics
    --pretty             Indent the generated HTML content
    --no-warnings        Do not print diagnostics
-h, --help               Show help
-v, --version            Show version
```

Examples:

```bash
# Write next to input as welcome.html
bun run src/cli.ts welcome.md

# Choose output path
bun run src/cli.ts welcome.md -o email.html

# Use explicit config
bun run src/cli.ts welcome.md --config mdtoemail.toml -o email.html

# Use a reusable theme
bun run src/cli.ts welcome.md --theme newsletter -o email.html
bun run src/cli.ts welcome.md --theme ./examples/themes/newsletter.toml -o email.html

# CI-style validation: fail before writing if warning diagnostics occur
bun run src/cli.ts welcome.md --strict -o email.html

# Suppress diagnostic output
bun run src/cli.ts welcome.md --no-warnings -o email.html
```

If `--output` is omitted, the output path is derived from the input:

- `welcome.md` → `welcome.html`
- `welcome.markdown` → `welcome.html`
- `welcome` → `welcome.html`

Existing output files are overwritten.

## Configuration

`mdtoemail` uses TOML. If `--config` is omitted, it auto-loads `mdtoemail.toml` from the current working directory when present; otherwise defaults are used.

Start from the complete example:

```bash
cp mdtoemail.example.toml mdtoemail.toml
```

Core config shape:

```toml
[markdown]
gfm = true
frontmatter = true

[email]
container_width = 600
outer_padding = "24px 12px"
warnings = true
strict = false
pretty = false

[theme]
# Optional reusable theme selected from ./themes/<name>.toml.
# extends = "newsletter"
background_color = "#f4f4f4"
container_background = "#ffffff"
text_color = "#222222"
heading_color = "#222222"
link_color = "#2563eb"
border_color = "#dddddd"
font_family = "Arial, Helvetica, sans-serif"
base_font_size = "16px"
line_height = "1.5"
content_padding = "32px"
```

See [`mdtoemail.example.toml`](./mdtoemail.example.toml) for every supported token.

### Merge order

Config is resolved in this order:

1. built-in defaults
2. reusable theme file selected by `[theme].extends` or `--theme`
3. project config file
4. CLI overrides (`--theme` overrides `[theme].extends`)

### Markdown options

- `gfm`: enables GitHub Flavored Markdown features through Sätteri, including tables, strikethrough, task lists, autolinks, and footnotes.
- `frontmatter`: extracts frontmatter instead of rendering it as Markdown.

Raw HTML in the Markdown source is always escaped in email-safe output; there is no passthrough option.

### Email options

- `container_width`: inner email container width in pixels.
- `outer_padding`: spacing around the centered container.
- `warnings`: print diagnostics to stderr.
- `strict`: exit non-zero before writing output if warning diagnostics occur.
- `pretty`: indent the generated HTML content for readability (cosmetic; line-based indentation, not a full formatter).

### Theme options

Theme values are safe design tokens inserted into renderer-controlled inline styles. Supported tokens cover colors, fonts, spacing, headings, paragraphs, lists, tables, code/pre, blockquotes, images, and footnotes.

To prevent CSS declaration injection and avoid fragile old-client CSS, style values reject empty/control values, `;`, `{}`, angle brackets, CSS comments, `url(...)`, `expression(...)`, `var(...)`, `calc(...)`, `clamp(...)`, modern color functions, and viewport/container units.

## Reusable themes

Select a named theme in config:

```toml
[theme]
extends = "newsletter"
```

Or via CLI:

```bash
bun run src/cli.ts input.md --theme newsletter -o email.html
bun run src/cli.ts input.md --theme ./examples/themes/newsletter.toml -o email.html
```

Resolution rules:

- named themes resolve to `themes/<name>.toml`
- with `--config`, named themes resolve relative to the config file directory
- without `--config`, named themes resolve relative to the current working directory
- explicit `--theme ./path/to/theme.toml` paths resolve from the current working directory

Theme files may contain only:

- `[theme]` tokens
- `[email].container_width`
- `[email].outer_padding`

Theme files must not contain `[markdown]`, `email.warnings`, `email.strict`, or `[theme].extends`.

Example theme file:

```toml
[email]
container_width = 640
outer_padding = "32px 12px"

[theme]
background_color = "#f7f2ea"
container_background = "#ffffff"
text_color = "#1f2933"
heading_color = "#111827"
link_color = "#b45309"
content_padding = "36px"
```

## Diagnostics and strict mode

Diagnostics describe content that was changed, removed, escaped, or may be email-client-sensitive.

Example output:

```txt
Warning [unsafe-link-url]: Removed unsafe link URL "javascript:alert(1)".
Warning [raw-html-escaped]: Escaped raw HTML because arbitrary HTML is not supported in email-safe output.
Info [task-list-input-transformed]: Converted task-list checkbox inputs to plain text symbols for email compatibility.
```

Strict mode fails only on warning diagnostics, not info diagnostics:

```bash
bun run src/cli.ts input.md --strict -o email.html
```

If strict mode fails, no output file is written.

## Email compatibility approach

Generated HTML favors broad email compatibility over modern web features:

- table-based outer layout
- legacy table attributes: `width`, `cellpadding`, `cellspacing`, `border`, `align`, `valign`, `bgcolor`
- inline styles
- Outlook-oriented table spacing resets where useful
- fluid-hybrid inner container: fixed `width` attribute plus `width:100%;max-width:...`
- simple system fonts, spacing, colors, and borders
- HTTPS-only generated image tags
- no JavaScript, forms, interactive inputs, external CSS, or raw HTML passthrough
- GFM task-list inputs converted to text symbols

Recommended external references:

- [Can I Email](https://www.caniemail.com/)
- [Campaign Monitor CSS support](https://www.campaignmonitor.com/css/)
- [Mailchimp HTML email basics](https://templates.mailchimp.com/getting-started/html-email-basics/)

## Security / sanitization notes

`mdtoemail` makes Sätteri-generated Markdown output safer for email. It is **not** a general-purpose arbitrary HTML sanitizer.

Current behavior:

- raw HTML is escaped
- unsafe URL protocols such as `javascript:`, `data:`, and `file:` are rejected
- protocol-relative URLs like `//example.com` are rejected
- image tags require absolute `https:` URLs
- unsupported images are removed with alt-text fallback where possible
- link URLs allow `http:`, `https:`, `mailto:`, `tel:`, relative URLs, and hash URLs
- `http:` and relative links are kept but reported as diagnostics

## Examples

The `examples/` directory includes sample Markdown, config overrides, theme files, and generated HTML.

```bash
# Default rendering
bun run src/cli.ts examples/product-update.md -o examples/product-update.html

# Reusable theme file
bun run src/cli.ts examples/product-update.md \
  --theme ./examples/themes/newsletter.toml \
  -o examples/product-update-newsletter.html

# Config extends a named theme and overrides tokens
bun run src/cli.ts examples/product-update.md \
  --config examples/product-update-custom.toml \
  -o examples/product-update-custom.html

# Transactional example
bun run src/cli.ts examples/security-notice.md \
  --config examples/security-notice-custom.toml \
  -o examples/security-notice-custom.html

# Theme-token showcase
bun run src/cli.ts examples/theme-customizations.md \
  --config examples/theme-customizations.toml \
  -o examples/theme-customizations-custom.html
```

Reusable example themes:

- `examples/themes/minimal.toml`
- `examples/themes/newsletter.toml`
- `examples/themes/transactional.toml`

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

Scripts:

- `bun run dev -- <args>` — run the CLI from source
- `bun test` — run tests
- `bun run typecheck` — run TypeScript checks
- `bun run build` — bundle the Bun target into `dist/`

This project is intended to run as a Bun/npm CLI. Standalone compiled binaries are not the current target because Sätteri uses native bindings.

## Scope

In scope:

- Markdown file to email-friendly HTML file
- TOML configuration
- safe default theme and reusable theme files
- diagnostics and strict mode
- conservative email markup

Out of scope:

- sending email
- SMTP/provider integrations
- bounce/complaint handling
- tracking pixels / click tracking
- webhooks
- marketing automation
- server mode

## License

MIT. See [`LICENSE`](./LICENSE).
