# mdtoemail

Convert Markdown into standalone, email-friendly HTML with inline styles and a conservative table layout. It generates HTML; it does not send email.

## Quick start

Requires [Bun 1.3+](https://bun.sh/).

```bash
git clone https://github.com/maxedapps/mdtoemail.git
cd mdtoemail
bun install

bun run src/cli.ts newsletter.md -o newsletter.html
```

If `--output` is omitted, `newsletter.md` becomes `newsletter.html`. Open the generated file directly in a browser:

```bash
open newsletter.html       # macOS
xdg-open newsletter.html   # Linux
```

## Options

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

## Configuration

Copy the complete config example:

```bash
cp mdtoemail.example.toml mdtoemail.toml
```

`mdtoemail.toml` is loaded automatically from the current directory. Use `--config` to select another file.

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

See [`mdtoemail.example.toml`](./mdtoemail.example.toml) for every supported theme token.

### Syntax highlighting

Highlighting is opt-in. Enable it in the [complete config example](./mdtoemail.example.toml), and use strict mode for production (`email.strict = true` or `--strict`):

```toml
[markdown]
syntax_highlighting = true
syntax_highlighting_mode = "light" # or "dark"

[email]
strict = true
```

Ordinary fences and optional one-based highlighted ranges with visual line numbers are supported:

````md
```ts
const ready = true;
```

```ts {2,4-6} lineNumbers
// ...
```
````

Bundled labels/aliases are: Bash (`bash`, `sh`, `shell`, `shellscript`), CSS (`css`), diff (`diff`), HTML (`html`), JavaScript (`js`, `javascript`), JSON (`json`), JSX (`jsx`), Markdown (`md`, `markdown`), Python (`py`, `python`), SQL (`sql`), TOML (`toml`), TSX (`tsx`), TypeScript (`ts`, `typescript`), and YAML (`yaml`, `yml`). `text`, `txt`, and `plaintext` intentionally remain plain.

`syntax_highlighting_mode` selects one coherent fixed profile per generated mail. Light uses GitHub-light tokens with `#f6f8fa` background, `#24292e` foreground, `#fff8c5` selected lines, and `#6e7781` line numbers. Dark uses GitHub-dark-default tokens with `#0d1117` background, `#e6edf3` foreground, `#3b3424` selected lines, and `#8b949e` line numbers. Both use `Courier New, Courier, monospace` at `14px/20px`. Arbitrary palettes and highlighted-block typography remain unsupported; plain-code theme tokens do not alter either fixed profile.

Keep each block at most 80 conservative display columns per line, 20,000 UTF-16 code units, 200 logical lines, and 8,000 produced tokens; final HTML must stay below 85 KiB. The 80-column limit is a diagnostic threshold, not a wrapping guarantee: unbroken text can still overflow narrow clients even when strict conversion is warning-free. Unsupported labels fall back to plain code with an info diagnostic. Tokenization errors or block limits preserve plain code and warn; malformed ranges are ignored and warn. Strict mode prevents warning-bearing output from being written.

Indentation uses NBSP characters and tabs expand to four-column stops. Copying may therefore include NBSPs, expanded tabs, or visual line numbers depending on the client. Syntax-highlighting compatibility remains best-effort and unqualified because no post-provider client matrix was run. Recipient-controlled dark mode may still invert or adjust colors; test important messages with your actual provider and target clients.

Try the warning-free canonical example:

```bash
# Light profile
bun run src/cli.ts examples/code-highlighting.md \
  --config examples/code-highlighting.toml --strict \
  -o examples/code-highlighting.html

# Dark profile and surrounding email theme
bun run src/cli.ts examples/code-highlighting.md \
  --config examples/code-highlighting-dark.toml --strict \
  -o examples/code-highlighting-dark.html
```

### Reuse one config

```bash
bun run src/cli.ts notes/july.md --config newsletter.toml -o notes/july.html
bun run src/cli.ts notes/august.md --config newsletter.toml -o notes/august.html
```

Batch conversion:

```bash
for file in notes/*.md; do
  bun run src/cli.ts "$file" --config newsletter.toml -o "${file%.md}.html"
done
```

### Reusable themes

```bash
# Theme file
bun run src/cli.ts input.md --theme ./themes/newsletter.toml -o email.html

# Named theme: resolves themes/newsletter.toml
bun run src/cli.ts input.md --theme newsletter -o email.html
```

A config can also select a named theme:

```toml
[theme]
extends = "newsletter"
```

Included themes: `minimal`, `newsletter`, and `transactional` under `examples/themes/`.

## Personal-notes newsletter example

Two Markdown issues share one warm serif config:

- `examples/personal-notes.toml`
- `examples/personal-notes-july.md`
- `examples/personal-notes-august.md`

```bash
bun run src/cli.ts examples/personal-notes-july.md \
  --config examples/personal-notes.toml \
  -o examples/personal-notes-july.html

open examples/personal-notes-july.html
```

More examples are available under `examples/`.

## Important behavior

- Existing output files are overwritten.
- Diagnostics are written to stderr. Use `--strict` or `email.strict = true` for CI.
- Raw HTML is escaped; it is never passed through.
- Images require absolute HTTPS URLs.
- Unsafe URLs such as `javascript:`, `data:`, and `file:` are removed.
- Theme values are safe design tokens, not arbitrary CSS.
- Use system font stacks; custom web fonts are unreliable in email clients.
- Test generated HTML with your email provider and target clients before sending.

## Development

```bash
bun test
bun run typecheck
bun run build
```

## License

MIT. See [`LICENSE`](./LICENSE).
