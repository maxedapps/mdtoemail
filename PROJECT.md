# mdtoemail Project Summary

## Goal

Build a modern, very fast **Markdown → email-friendly HTML** converter as a Bun + TypeScript CLI.

The tool should take a `.md` file as input and produce conservative HTML that works reliably across major email clients. It should focus only on conversion — **no sending server, no bounce/complaint handling, no webhook system**.

## Product Scope

### In scope

- CLI tool for converting Markdown files to standalone email HTML.
- TOML-based configuration.
- Clean default email styling.
- Theme/style customization through safe config options.
- Configurable Markdown features, especially GFM.
- Conservative, broadly compatible email HTML.
- Inline styles by default.
- Diagnostics/warnings for email-compatibility issues.
- Optional support for email-specific Markdown extensions such as buttons/callouts.

### Out of scope

- Sending emails.
- SMTP/provider integrations in MVP.
- Bounce handling.
- Complaint handling.
- Tracking pixels / open tracking.
- Click tracking.
- Webhook server.
- Marketing automation.

Users should send the generated HTML through their own app, SMTP setup, or providers such as Resend, Postmark, Mailgun, SES, SendGrid, etc.

## Recommended Positioning

> A fast Bun-powered Markdown to email HTML compiler that outputs conservative, broadly compatible email markup, with configurable Markdown features and safe TOML-based theming.

Avoid overpromising “works in every email client” or “full Markdown compatibility” initially. Better wording:

- “email-safe by default”
- “broadly compatible conservative HTML”
- “GFM-capable”
- “optimized for transactional/newsletter email markup”

## Runtime / Language

- TypeScript
- Bun runtime
- Bun CLI
- Bun file APIs where useful
- Bun TOML support for config parsing

Useful Bun APIs/features:

- `Bun.file(...).text()` for reading Markdown/config files.
- `Bun.write(...)` for writing output HTML.
- `Bun.TOML.parse(...)` for runtime TOML config parsing.
- `bun build` for bundling the Bun CLI when needed.

Ship and document this as a Bun/npm CLI.

## Markdown Engine: Sätteri

Use [Sätteri](https://satteri.bruits.org/) for Markdown parsing/conversion instead of writing a full custom Markdown parser.

Sätteri is a high-performance Markdown/MDX processing library:

- npm package: `satteri`
- repository: `bruits/satteri`
- found version during research: `0.9.4`
- MIT licensed
- Rust parser / AST internals
- TypeScript/JavaScript plugin layer
- native binaries for macOS, Linux, Windows
- WASI fallback for browser/edge-like runtimes
- built around `pulldown-cmark`
- supports MDAST/HAST-style trees

Important caveat: Sätteri is pre-1.0, so APIs may change. Pin the dependency version initially.

```json
{
  "dependencies": {
    "satteri": "0.9.4"
  }
}
```

## Why Sätteri Fits

Sätteri solves the hardest non-email part: Markdown parsing.

It supports configurable features:

- GFM
- frontmatter
- math
- heading attributes
- directives
- superscript
- subscript
- wikilinks
- smart punctuation

Default Sätteri behavior enables:

- `gfm: true`
- `frontmatter: true`

GFM includes:

- tables
- footnotes
- strikethrough
- task lists
- GitHub-style autolinks

Sätteri also supports plugins:

- `mdastPlugins` for Markdown AST transforms
- `hastPlugins` for HTML AST transforms

That is useful for controlling generated HTML before final rendering.

## Important Sätteri Caveats

- Existing remark/rehype plugins do **not** work directly.
- Sätteri uses native napi binaries, so packaging should be tested as a normal Bun/npm CLI.
- Sätteri’s default HTML is normal web HTML, not email-specific HTML.
- Therefore, Sätteri should be treated as the Markdown/AST engine, not the complete converter.

## Recommended Architecture

Prefer this pipeline:

```txt
Markdown file
  ↓
Load TOML config
  ↓
Sätteri Markdown parse
  ↓
MDAST plugins: normalize/remove unsafe Markdown constructs
  ↓
HAST generation
  ↓
HAST plugins: sanitize, allowlist tags/attrs, normalize links/images
  ↓
Email renderer / serializer
  ↓
Email document wrapper with inline styles
  ↓
Output HTML file
```

Long-term, prefer `markdownToHast` plus a custom email renderer over direct `markdownToHtml`, because the project needs deterministic email-specific output.

Possible source structure:

```txt
src/
  cli.ts
  config/
    load-toml-config.ts
    defaults.ts
    normalize.ts
    types.ts
  markdown/
    satteri.ts
    features.ts
    plugins/
      strip-raw-html.ts
      email-directives.ts
      collect-diagnostics.ts
  email/
    allowed-tags.ts
    allowed-attrs.ts
    sanitize-hast.ts
    inline-styles.ts
    render-email.ts
    wrapper.ts
  theme/
    default-theme.ts
    resolve-theme.ts
  diagnostics/
    warnings.ts
```

## CLI Shape

Example commands:

```bash
mdtoemail input.md
mdtoemail input.md -o email.html
mdtoemail input.md --config mdtoemail.toml
mdtoemail input.md --gfm
mdtoemail input.md --theme default
mdtoemail input.md --pretty
mdtoemail input.md --strict
```

Potential flags:

- `-o, --output <file>`
- `-c, --config <file>`
- `--gfm`
- `--no-gfm`
- `--pretty`
- `--strict`
- `--warnings`
- `--no-warnings`
- `--version`
- `--help`

## TOML Config

Use TOML instead of JSON.

Example `mdtoemail.toml`:

```toml
[markdown]
gfm = true
frontmatter = true
math = false
heading_attributes = false
directives = false
superscript = false
subscript = false
wikilinks = false
smart_punctuation = false
raw_html = false

[email]
container_width = 600
inline_css = true
pretty = false
warnings = true
strict = false
require_image_alt = true

[theme]
background_color = "#f4f4f4"
container_background = "#ffffff"
text_color = "#222222"
muted_text_color = "#666666"
link_color = "#2563eb"
font_family = "Arial, Helvetica, sans-serif"
base_font_size = "16px"
line_height = "1.5"
content_padding = "32px"

[styles.h1]
font_size = "28px"
line_height = "1.25"
margin = "0 0 20px"

[styles.p]
margin = "0 0 16px"
```

Recommendation: use `snake_case` in TOML and normalize internally to camelCase TypeScript objects.

## Styling Strategy

Primary customization should be via **theme tokens**, not arbitrary CSS.

Reason: arbitrary CSS requires parsing selectors, cascade, specificity, media support, and email-client compatibility decisions.

Good initial theme-token fields:

- `font_family`
- `base_font_size`
- `line_height`
- `text_color`
- `muted_text_color`
- `link_color`
- `background_color`
- `container_background`
- `content_padding`
- `heading_color`
- `blockquote_border_color`
- `code_background`
- `border_color`

Advanced per-element style overrides can be supported later through TOML tables like `[styles.p]`, `[styles.h1]`, `[styles.a]`.

All final styles should be emitted inline by default.

## Email HTML Strategy

Email clients remain very constrained. Prefer:

- table-based outer layout
- inline CSS
- simple CSS properties
- conservative typography
- system fonts
- fixed-width centered container, commonly 600px
- no JavaScript
- no external CSS
- no forms
- no iframes
- no video/audio
- no CSS variables
- no flex/grid for critical layout

Suggested outer wrapper:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title></title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
            <tr>
              <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#222222;">
                <!-- rendered markdown content -->
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Allowed HTML Elements

Initial allowlist:

```txt
p
br
strong
em
a
ul
ol
li
blockquote
code
pre
h1
h2
h3
h4
h5
h6
hr
img
table
thead
tbody
tr
th
td
del
sup
sub
```

Possibly allow internally generated `span`/`div`, but avoid user-authored arbitrary raw HTML output.

Disallow/remove:

```txt
script
style
iframe
object
embed
video
audio
form
input
button
textarea
select
svg
canvas
link
meta
```

Layout tables generated by the tool should use `role="presentation"`. Markdown data tables should not.

## Raw HTML Policy

Raw HTML should default to disabled.

Recommended config:

```toml
[markdown]
raw_html = false
```

If raw HTML appears in Markdown:

- default behavior: escape or remove it
- emit a warning
- in strict mode: fail conversion

Raw HTML is risky because email clients sanitize inconsistently and unsupported HTML can break layout.

## Attributes Policy

Strip all attributes by default, then re-add safe ones.

Suggested safe attrs:

### `a`

- `href`
- maybe `title`
- inline `style`

Validate protocols:

- allow `https:`
- allow `http:` optionally
- allow `mailto:`
- allow `tel:`
- disallow `javascript:`, `data:`, unknown protocols by default

### `img`

- `src`
- `alt`
- `width`
- `height`
- inline `style`

Prefer remote HTTPS images for email. Warn on missing alt text.

### table elements

- `width`
- `align`
- `cellpadding`
- `cellspacing`
- `border`
- inline `style`

## Diagnostics / Warnings

This should be a core differentiator.

Examples:

```txt
Warning: Raw HTML removed at line 12.
Warning: Image missing alt text at line 18.
Warning: Link uses unsupported protocol "javascript:" at line 22.
Warning: Table has 8 columns; it may be hard to read on mobile.
Warning: Code block contains very long lines; it may overflow in some clients.
Warning: Footnotes may have inconsistent support in some email clients.
```

Strict mode can convert warnings into errors for safer CI usage.

## Email-Specific Markdown Extensions

Sätteri supports directives. This is useful for email components.

Potential syntax:

```md
::button[Confirm email]{href="https://example.com/confirm"}

:::callout{type="info"}
This is important.
:::
```

These can compile to conservative, table-based email HTML.

Recommendation: keep directives disabled by default initially, then add them as a documented optional feature.

## MVP Markdown Support

Use Sätteri with GFM enabled by default, but test and sanitize output.

Core content to support well:

- paragraphs
- headings
- bold
- italic
- inline code
- fenced code blocks
- links
- images
- unordered lists
- ordered lists
- blockquotes
- horizontal rules
- hard/soft line breaks
- GFM tables
- GFM task lists
- strikethrough
- autolinks

Be cautious with:

- footnotes
- raw HTML
- math
- MDX
- heading attributes
- wikilinks

MDX should likely be out of scope for MVP.

## Testing Strategy

Use snapshot tests heavily.

Test categories:

- Markdown feature snapshots
- email wrapper snapshots
- inline style snapshots
- config normalization
- unsafe HTML removal
- unsafe attribute removal
- URL protocol validation
- GFM table rendering
- task list rendering
- image warnings
- strict mode failures

Also manually test generated output with email-client tools/references:

- Can I email: https://www.caniemail.com/
- Campaign Monitor CSS guide: https://www.campaignmonitor.com/css/
- Mailchimp HTML email basics: https://templates.mailchimp.com/getting-started/html-email-basics/

## Biggest Risks

1. **Sätteri pre-1.0 stability**
   - Pin exact version.
   - Keep integration isolated in `src/markdown/satteri.ts`.

2. **Native dependency packaging**
   - Sätteri uses native dependencies.
   - Ship as a Bun/npm CLI first.

3. **Email-client compatibility complexity**
   - Keep output conservative.
   - Prefer inline styles and table wrappers.
   - Avoid arbitrary CSS as the main customization mechanism.

4. **Raw HTML safety**
   - Disable by default.
   - Add strict mode.

5. **CSS customization complexity**
   - Use theme tokens first.
   - Add limited per-element style overrides later.

## Implementation Plan

### Phase 1: Foundation

- Set up Bun + TypeScript project.
- Add CLI entrypoint.
- Add TOML config loading.
- Add default config/theme.
- Add basic file input/output.

### Phase 2: Sätteri Integration

- Install and pin `satteri`.
- Convert Markdown to HAST/HTML.
- Inspect output for headings, links, images, tables, task lists, raw HTML.
- Add feature mapping from TOML config to Sätteri options.

### Phase 3: Email Renderer

- Add outer email wrapper.
- Add default inline styles.
- Add allowed tag/attribute policy.
- Add unsafe element removal.
- Add URL protocol validation.

### Phase 4: Diagnostics

- Add warnings system.
- Add strict mode.
- Warn for missing image alt text.
- Warn for raw HTML.
- Warn for unsupported protocols.
- Warn for wide tables / long code lines.

### Phase 5: Styling Customization

- Add theme tokens.
- Add per-element style overrides.
- Ensure all output remains inline-styled.

### Phase 6: Email Components

- Add optional directive support.
- Implement button directive.
- Implement callout directive.
- Render using conservative table-based HTML.

### Phase 7: Packaging

- Add npm/Bun CLI package config.
- Test on macOS/Linux/Windows if possible.
- Document provider-agnostic usage.

## Final Recommendation

Use Sätteri for Markdown parsing and AST generation. Build the project’s unique value around email-safe rendering, strict sanitization, inline styling, TOML configuration, diagnostics, and optional email-specific components.

Do **not** add a server. Keep the project focused: Markdown in, email-compatible HTML out.
