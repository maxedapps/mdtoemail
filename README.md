# mdtoemail

Convert Markdown into standalone, email-friendly HTML with inline styles and a conservative table layout. `mdtoemail` generates HTML; it does not send email.

## Requirements

- Node.js `>=22.18.0`
- npm for installation and contributor workflows

The CLI runs on Node.js. The ESM-only library entry is portable to Cloudflare Workers and is tested in a Worker without Node.js compatibility flags.

## CLI quick start

Run without installing globally:

```bash
npx mdtoemail newsletter.md -o newsletter.html
```

Or install globally:

```bash
npm install --global mdtoemail
mdtoemail newsletter.md -o newsletter.html
```

If `--output` is omitted, `newsletter.md` becomes `newsletter.html`. Existing output files are overwritten.

### Options

```txt
-o, --output <file>      Output HTML file
-c, --config <file>      TOML config file
    --theme <name|file>  Named theme or theme TOML file
    --strict             Fail before writing if warnings occur
    --pretty             Indent generated HTML
    --no-warnings        Hide diagnostics
-h, --help               Show help
-v, --version            Show version
```

## Library

Install the package locally:

```bash
npm install mdtoemail
```

Import the ESM-only API and compile a Markdown string:

```ts
import { compileMarkdownEmail } from "mdtoemail";

const { html, diagnostics, frontmatter } = await compileMarkdownEmail(
  "# Hello\n\nThis is **bold**.",
  { title: "Hello" },
);
```

`html` is a complete document. `diagnostics` contains warnings and informational messages. `frontmatter` is `{ kind, value }` or `null`.

The library performs no file I/O, logging, config loading, or email delivery. Pass an optional resolved `config` object when needed. Its package entry does not depend on Node.js built-ins, so the same ESM import works in Cloudflare Workers without `nodejs_compat`.

## Configuration

The CLI automatically loads `mdtoemail.toml` from the current directory. Select another file with `--config`.

```toml
[markdown]
gfm = true
frontmatter = true

[email]
container_width = 600
strict = false
pretty = false

[theme]
background_color = "#f4f4f4"
container_background = "#ffffff"
text_color = "#222222"
heading_color = "#222222"
link_color = "#2563eb"
font_family = "Arial, Helvetica, sans-serif"
base_font_size = "16px"
line_height = "1.5"
content_padding = "32px"
```

See [`mdtoemail.example.toml`](./mdtoemail.example.toml) for every option and theme token.

### Themes

Use a theme file directly:

```bash
npx mdtoemail input.md --theme ./themes/newsletter.toml -o email.html
```

Or resolve a named theme from `./themes/<name>.toml`:

```bash
npx mdtoemail input.md --theme newsletter -o email.html
```

A config can extend the same named theme:

```toml
[theme]
extends = "newsletter"
```

See [`examples/themes/`](./examples/themes/) for `minimal`, `newsletter`, and `transactional` examples.

### Syntax highlighting

Highlighting is opt-in. Use strict mode for production output:

```toml
[markdown]
syntax_highlighting = true
syntax_highlighting_mode = "light" # or "dark"

[email]
strict = true
```

Standard fences, highlighted line ranges, and visual line numbers are supported:

````md
```ts
const ready = true;
```

```ts {2,4-6} lineNumbers
// ...
```
````

Bundled languages: Bash, CSS, diff, HTML, JavaScript, JSON, JSX, Markdown, Python, SQL, TOML, TSX, TypeScript, and YAML. Unknown labels fall back to plain code.

For reliable output, keep each code block within 80 display columns, 20,000 UTF-16 code units, 200 lines, and 8,000 tokens; keep final HTML below 85 KiB. Violations produce diagnostics. Highlighting and recipient-controlled dark mode remain email-client dependent.

## Production guidance

- Diagnostics are written to stderr; use `--strict` or `email.strict = true` in CI.
- Raw HTML is escaped.
- Images require absolute HTTPS URLs.
- Unsafe URLs such as `javascript:`, `data:`, and `file:` are removed.
- Theme values are safe design tokens, not arbitrary CSS.
- Use system font stacks; custom web fonts are unreliable in email clients.
- Test generated HTML with your email provider and target clients before sending.

More complete inputs and configs are available under [`examples/`](./examples/).

## Contributing

Requires Node.js `>=22.18.0` and npm. Install exactly from the lockfile and run the complete fast gate:

```bash
npm ci
npm run check
```

Useful individual commands map directly to package scripts:

```bash
npm run dev -- input.md -o email.html
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The package-level Node, types, CLI, and Cloudflare Worker validation is intentionally heavier:

```bash
npm run test:candidate
```

First-party code uses Oxfmt and type-aware Oxlint. The anti-slop policy keeps 11 measured rules blocking; four boundary-incompatible rules are deliberately disabled. Vendored plugin source under `tools/oxlint/anti-slop/` is excluded from local formatting and remediation; see its provenance notice before updating it.

## License

MIT. See [`LICENSE`](./LICENSE).
