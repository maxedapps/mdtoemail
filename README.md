# mdtoemail

Fast Markdown to conservative, email-friendly HTML using TypeScript, Bun, and Sätteri.

`mdtoemail` is a CLI-only converter: Markdown in, standalone HTML out. It does **not** send email, track opens/clicks, run a server, or manage provider webhooks.

## Status

Early development. The current implementation already renders Markdown through Sätteri, wraps it in a table-based email document, applies inline styles, sanitizes generated HTML, and reports diagnostics. The output is intentionally conservative, but real email-client testing is still required before relying on it for critical production campaigns.

## Features

- Bun + TypeScript CLI
- Markdown rendering via pinned `satteri@0.9.4`
- CommonMark basics and configurable GFM support
- TOML configuration
- Reusable TOML theme files plus safe theme tokens
- Table-based outer email wrapper
- Inline styles for common Markdown elements
- Conservative generated HTML sanitization:
  - strips Sätteri classes and unsupported attributes
  - removes unsafe link/image URLs
  - escapes raw HTML
  - converts GFM task-list checkboxes to `☑` / `☐`
- Diagnostics printed to stderr by default
- Strict mode for CI-style validation
- No runtime dependencies beyond Sätteri

## Requirements

- [Bun](https://bun.sh/) 1.3+

## Installation from source

```bash
bun install
```

Run the CLI directly:

```bash
bun run src/cli.ts input.md -o email.html
```

Or use the package script during development:

```bash
bun run dev -- input.md -o email.html
```

## Usage

```bash
bun run src/cli.ts [options] <input.md>
```

Options:

```txt
-o, --output <file>   Output HTML file
-c, --config <file>   TOML config file
    --theme <name|file>  Theme name from ./themes or TOML theme file
    --strict             Fail on warning diagnostics
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

# Fail if warning diagnostics are produced
bun run src/cli.ts welcome.md --strict -o email.html

# Suppress diagnostic output
bun run src/cli.ts welcome.md --no-warnings -o email.html
```

If `-o/--output` is omitted, the output path is derived from the input:

- `welcome.md` → `welcome.html`
- `welcome.markdown` → `welcome.html`
- `welcome` → `welcome.html`

Existing output files are overwritten.

## Examples

The `examples/` directory showcases default rendering, reusable theme files, and config-based theme overrides.

```bash
# Built-in defaults
bun run src/cli.ts examples/product-update.md -o examples/product-update.html

# Direct reusable theme file
bun run src/cli.ts examples/product-update.md \
  --theme ./examples/themes/newsletter.toml \
  -o examples/product-update-newsletter.html

# Config extends a named theme from examples/themes/newsletter.toml and overrides tokens
bun run src/cli.ts examples/product-update.md \
  --config examples/product-update-custom.toml \
  -o examples/product-update-custom.html

# Transactional theme plus local overrides
bun run src/cli.ts examples/security-notice.md \
  --config examples/security-notice-custom.toml \
  -o examples/security-notice-custom.html

# Dedicated theme-token showcase
bun run src/cli.ts examples/theme-customizations.md \
  --config examples/theme-customizations.toml \
  -o examples/theme-customizations-custom.html
```

Reusable example themes live in `examples/themes/`:

- `minimal.toml`
- `newsletter.toml`
- `transactional.toml`

## Configuration

`mdtoemail` uses TOML. If `--config` is not provided, it automatically loads `mdtoemail.toml` from the current working directory when present. Otherwise, defaults are used.

See [`mdtoemail.example.toml`](./mdtoemail.example.toml):

```toml
[markdown]
gfm = true
frontmatter = true
# Reserved for future unsafe/raw HTML handling. Email-safe output currently escapes raw HTML either way.
raw_html = false

[email]
container_width = 600
outer_padding = "24px 12px"
warnings = true
strict = false

[theme]
# Optional reusable theme selected from ./themes/<name>.toml, unless --theme overrides it.
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

### Markdown options

- `gfm`: enables GitHub Flavored Markdown features through Sätteri, including tables, strikethrough, task lists, autolinks, and footnotes.
- `frontmatter`: extracts YAML/TOML frontmatter instead of rendering it as Markdown.
- `raw_html`: accepted for future compatibility, but currently raw HTML is escaped in final email-safe output regardless of this setting.

### Email options

- `container_width`: width of the inner email container/table in pixels.
- `outer_padding`: spacing around the centered email container.
- `warnings`: prints diagnostics to stderr when `true`.
- `strict`: exits non-zero before writing output when warning-severity diagnostics are produced.

### Theme options

Theme values are inserted into conservative inline styles. Keep values simple and email-client-friendly.

Supported tokens include colors, fonts, base sizing, content padding, heading sizes/margins/line-heights, paragraph/list/table spacing, code/pre styling, blockquote styling, image margin, and footnote spacing. See [`mdtoemail.example.toml`](./mdtoemail.example.toml) for the complete list.

Style token values are validated: empty values, control characters, `;`, `{}`, angle brackets, CSS comments, `url(...)`, and `expression(...)` are rejected to prevent arbitrary CSS declaration injection.

#### Reusable theme files

Select a reusable theme from config:

```toml
[theme]
extends = "newsletter"
```

A named theme resolves to `themes/<name>.toml` relative to the explicit config file directory, or the current working directory when no config file is provided. `--theme <name>` overrides `[theme].extends` and follows the same named-theme lookup.

Explicit `--theme ./path/to/theme.toml` paths resolve from the current working directory.

Theme files are TOML files that may contain:

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

Diagnostics are printed to stderr by default. They describe content that was changed, removed, or escaped during conversion.

Example:

```txt
Warning [unsafe-link-url]: Removed unsafe link URL "javascript:alert(1)".
Warning [raw-html-escaped]: Escaped raw HTML because arbitrary HTML is not supported in email-safe output.
Info [task-list-input-transformed]: Converted task-list checkbox inputs to plain text symbols for email compatibility.
```

Current warning diagnostics can include:

- unsafe link URL removed
- unsafe image URL removed
- raw HTML escaped
- unsupported generated element removed

Current info diagnostics can include:

- task-list checkbox inputs converted to text symbols

Strict mode fails only on warning diagnostics, not info diagnostics:

```bash
bun run src/cli.ts input.md --strict -o email.html
```

If strict mode fails, no output file is written.

## Email compatibility approach

The generated HTML favors broad compatibility over modern web features:

- table-based outer layout
- inline styles
- simple system fonts
- simple spacing, colors, and borders
- no JavaScript
- no forms or interactive inputs
- raw HTML escaped
- task list inputs converted to plain text

This improves compatibility, but does not guarantee perfect rendering in every email client. Test important templates in your target clients and sending provider.

## Security / sanitization notes

`mdtoemail` is designed to make Sätteri-generated Markdown output safer for email. It is **not** a general-purpose arbitrary HTML sanitizer.

Important behavior:

- raw HTML is escaped
- unsafe URL protocols such as `javascript:`, `data:`, and `file:` are rejected
- protocol-relative URLs like `//example.com` are rejected
- image URLs are limited to `http:` and `https:` plus relative paths supported by the current URL policy
- link URLs allow `http:`, `https:`, `mailto:`, `tel:`, and relative/hash URLs

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

Scripts:

- `bun run dev -- <args>`: run the CLI from source
- `bun test`: run tests
- `bun run typecheck`: run TypeScript checks
- `bun run build`: bundle the Bun target into `dist/`

This project is intended to run as a Bun/npm CLI.

## Project scope

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
- tracking pixels
- click tracking
- webhooks
- marketing automation
- server mode

## License

MIT. See [`LICENSE`](./LICENSE).
