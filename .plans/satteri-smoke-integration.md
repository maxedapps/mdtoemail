# Plan: Sätteri Smoke Integration

## Summary

Replace the current placeholder `<pre>` output with real Markdown-to-HTML conversion through Sätteri while keeping the milestone deliberately small. This step proves that the CLI/config foundation can call Sätteri, map the existing `[markdown]` config flags to Sätteri feature options, preserve the current HTML shell/theme behavior, and produce test-covered Markdown output for core CommonMark/GFM cases.

This is still **not** the final email-safe renderer. Sätteri output is web HTML and will later need sanitization, email-specific rendering, inline styles per element, diagnostics, and a table-based email wrapper.

## Clarification status

No clarification is needed. The next milestone is clear: perform a Sätteri smoke integration, not the final email renderer.

## Confirmed requirements and assumptions

- Use TypeScript and Bun.
- Keep implementation simple and incremental.
- Prefer Bun/Node built-ins; add no new dependencies.
- Use already pinned `satteri@0.9.4`.
- Do not add a server.
- Keep TOML config as the source of Markdown feature settings.
- Preserve existing CLI behavior:
  - `--help`, `--version`
  - `-o/--output`
  - `-c/--config`
  - one positional input file
  - auto-load cwd `mdtoemail.toml`
- Replace placeholder escaped Markdown with rendered Markdown HTML.
- Keep existing simple HTML document wrapper for now; final conservative table-based email wrapper comes later.
- Treat current output as a smoke/proof-of-integration layer, not production email-safe output.
- `theme.linkColor` and element-specific styling remain mostly inactive until the email-rendering milestone.

## Relevant research findings

### Sätteri APIs

Sources:

- `node_modules/satteri/dist/index.d.ts`
- `node_modules/satteri/dist/compile.d.ts`
- Sätteri features docs: `https://satteri.bruits.org/docs/features/`
- Sätteri plugin API docs: `https://satteri.bruits.org/docs/plugin-api/`
- Sätteri plugin guide: `https://satteri.bruits.org/docs/plugins/`

Findings:

- `markdownToHtml(source, options)` returns `{ html, frontmatter, data }` when all plugins are sync, or a Promise if any plugin is async.
- `markdownToHtml` accepts:
  - `features`
  - `mdastPlugins`
  - `hastPlugins`
  - `fileURL`
  - `data`
- `features` is also accepted by `markdownToHast`, `markdownToMdast`, `mdxToJs`, and `mdxToHast`.
- Default Sätteri features are `gfm: true` and `frontmatter: true`.
- `Features` supports:
  - `gfm?: boolean | GfmOptions`
  - `frontmatter?: boolean`
  - `math?: boolean | MathOptions`
  - `headingAttributes?: boolean`
  - `directive?: boolean`
  - `superscript?: boolean`
  - `subscript?: boolean`
  - `wikilinks?: boolean`
  - `smartPunctuation?: boolean | SmartPunctuationOptions`
- This project currently exposes only:
  - `markdown.gfm`
  - `markdown.frontmatter`
  - `markdown.rawHtml`
- Sätteri frontmatter is **extracted** and returned separately as `{ kind: "yaml" | "toml", value: string }`; Sätteri does not parse the frontmatter body into structured data and does not render it into HTML by default.
- Sätteri has no documented `rawHtml` feature flag in `Features`.
- Markdown raw HTML is represented as `html` nodes in MDAST and as `raw` nodes in HAST.
- MDAST plugins can visit `html` nodes and replace them with text nodes to escape raw HTML.
- Empirical check with `satteri@0.9.4`:
  - `markdownToHtml("# Hi\n\n<em>x</em>")` outputs `<h1>Hi</h1>\n<p><em>x</em></p>\n`.
  - A simple MDAST plugin replacing `html` nodes with `{ type: "text", value: node.value }` outputs escaped raw HTML such as `&lt;em&gt;`.
  - GFM tables output normal `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`.
  - GFM task lists output `<input type="checkbox" ...>` inside list items and classes like `contains-task-list`; these are not email-safe and must be addressed in a later renderer/sanitizer.

### Bun/project findings

Sources:

- `package.json`
- `src/cli.ts`
- `src/config.ts`
- `test/config.test.ts`
- `PROJECT.md`

Findings:

- Bun version currently verified as `1.3.14`.
- Existing scripts:
  - `bun test`
  - `bun run typecheck`
  - `bun run build`
  - `bun run compile`
- Existing CLI imports `loadConfig`, reads input with `Bun.file(...).text()`, writes output with `Bun.write(...)`, and currently calls `renderPlaceholderHtml(markdown, input, config)`.
- `src/config.ts` already has the needed Markdown settings:
  - `gfm`
  - `frontmatter`
  - `rawHtml`
- Existing tests cover config and output path derivation only.

## Current state

Current output shape:

```html
<!doctype html>
<html>
  <head>...</head>
  <body style="...">
    <main style="...">
      <pre style="...">escaped original Markdown</pre>
    </main>
  </body>
</html>
```

After this milestone, the inner `<pre>` should be replaced by rendered HTML from Sätteri, wrapped by the same simple shell.

## Chosen implementation strategy

Add one focused Markdown module:

```txt
src/markdown.ts
```

Responsibilities:

- Map `Config.markdown` to Sätteri `features`.
- Call `markdownToHtml`.
- Enforce current `rawHtml` behavior by adding a tiny MDAST plugin when `rawHtml` is `false`.
- Return a small result object:

```ts
export interface RenderedMarkdown {
  html: string;
  frontmatter: Frontmatter | null;
}

export async function renderMarkdown(markdown: string, config: Config): Promise<RenderedMarkdown>;
```

Implementation note: always return a Promise and have the CLI use `await renderMarkdown(...)` so future async plugin support does not require CLI changes.

Rationale:

- Keeps Sätteri-specific imports and behavior out of `src/cli.ts`.
- Avoids premature directory structure such as `src/markdown/satteri.ts` until the renderer grows.
- Makes feature mapping and raw HTML behavior easy to unit test.
- Keeps the CLI responsible for I/O and wrapper generation only.

## Alternatives considered

### 1. Put Sätteri directly in `src/cli.ts`

Rejected. It is the smallest possible change, but mixes CLI flow, file I/O, wrapper rendering, and Markdown engine details. A single `src/markdown.ts` module is still simple and improves testability.

### 2. Use `markdownToHast` immediately with a custom serializer

Rejected for this smoke step. It is the likely long-term direction for deterministic email HTML, but it expands scope into serializer design, allowed tags, attributes, styling, and sanitization. This milestone should first validate Sätteri integration and config mapping.

### 3. Add sanitizer/allowlist now

Rejected. Important but too large for this milestone. It should be a dedicated next milestone after we know Sätteri output shape.

### 4. Ignore `markdown.rawHtml` until sanitizer phase

Rejected. The config field already exists and raw HTML pass-through is a material safety issue. A small MDAST plugin can make `raw_html = false` observable now by escaping raw HTML.

### 5. Remove raw HTML instead of escaping it

Rejected for this milestone. Escaping preserves user content visibly and is easy to test. Later diagnostics/strict mode can offer remove/fail behavior.

## Implementation tasks

### 0. Pre-flight Sätteri compile spike

Before changing source, run a tiny Sätteri compile smoke test because Sätteri uses native bindings and standalone Bun executable packaging may fail.

Suggested command:

```bash
bun -e 'import { markdownToHtml } from "satteri"; console.log(markdownToHtml("# Hi").html)'
bun run compile
./dist/mdtoemail --version
```

After implementation, repeat compiled binary conversion with real Sätteri output.

If `bun run compile` or the compiled binary fails because of Sätteri native binding packaging, stop and investigate Bun/Sätteri packaging behavior before proceeding. This may affect whether standalone binaries stay a supported build target.

### 1. Add `src/markdown.ts`

Implement:

```ts
import { defineMdastPlugin, markdownToHtml, type Features, type Frontmatter } from "satteri";
import type { Config } from "./config";
```

Add:

```ts
export interface RenderedMarkdown {
  html: string;
  frontmatter: Frontmatter | null;
}

export function markdownFeatures(config: Config): Features {
  return {
    gfm: config.markdown.gfm,
    frontmatter: config.markdown.frontmatter,
  };
}
```

Add a raw HTML escaping plugin:

```ts
const escapeRawHtml = defineMdastPlugin({
  name: "escape-raw-html",
  html(node) {
    return { type: "text", value: node.value };
  },
});
```

Then:

```ts
export async function renderMarkdown(markdown: string, config: Config): Promise<RenderedMarkdown> {
  const result = await markdownToHtml(markdown, {
    features: markdownFeatures(config),
    mdastPlugins: config.markdown.rawHtml ? [] : [escapeRawHtml],
  });

  return {
    html: result.html,
    frontmatter: result.frontmatter,
  };
}
```

Notes:

- Use `await` even though current plugin is sync because Sätteri return type can become Promise when async plugins are introduced.
- Keep `rawHtml` out of `features` because Sätteri does not expose it as a feature flag.
- Keep `frontmatter` returned but do not render it yet.
- This only escapes raw HTML source nodes; it does not sanitize URLs or generated HTML.

### 2. Update `src/cli.ts`

Replace:

```ts
const html = renderPlaceholderHtml(markdown, input, config);
```

With:

```ts
let renderedHtml: string;
try {
  const rendered = await renderMarkdown(markdown, config);
  renderedHtml = rendered.html;
} catch (error) {
  throw new Error(`Could not render Markdown. ${messageFrom(error)}`);
}

const html = renderHtmlDocument(renderedHtml, input, config);
```

Rename `renderPlaceholderHtml` to something less misleading, e.g.:

```ts
function renderHtmlDocument(contentHtml: string, input: string, config: Config): string
```

This is safe because `renderPlaceholderHtml` is a non-exported local function; existing tests only import `deriveOutputPath`.

Remove the `<pre>` placeholder and insert rendered HTML directly:

```html
<main style="...">
  ${contentHtml}
</main>
```

Keep the current wrapper and style tokens as-is.

Do not yet inline element-specific styles for headings, paragraphs, links, lists, etc. That belongs to the next email-rendering milestone. Note that `theme.linkColor` will not affect generated `<a>` tags until that later milestone.

### 3. Add Markdown tests

Create:

```txt
test/markdown.test.ts
```

Use `bun:test` to cover:

1. CommonMark basics:
   - input: `# Hello\n\nThis is **bold** and *emphasized*.`
   - expect heading, paragraph, `<strong>`, `<em>`.
2. Links:
   - `[Site](https://example.com)` renders `<a href="https://example.com">Site</a>`.
3. GFM table when enabled:
   - with default config, table renders `<table>` and cells.
4. GFM table when disabled:
   - with `gfm: false`, the same table should not render as a `<table>`.
   - Do not over-specify exact fallback output; assert absence of `<table>` and only stable text if needed.
5. Task lists smoke:
   - with `gfm: true`, task list currently includes checkbox input output.
   - This documents current Sätteri output and highlights why the next milestone must sanitize/render email-safe equivalents.
   - This test is documentation-oriented; keep it concise.
6. Frontmatter:
   - with `frontmatter: true`, `renderMarkdown` returns `{ kind, value }` and output excludes the frontmatter block.
   - with `frontmatter: false`, frontmatter delimiters should be treated as normal Markdown; assert based on actual inspected output without over-specifying.
7. Raw HTML disabled by default:
   - `<script>alert(1)</script>` or `<em>x</em>` should not pass through as HTML.
   - Assert escaped output contains `&lt;script&gt;` / `&lt;em&gt;`.
   - Avoid exact full-output assertions for block-level raw HTML, since root-level text may not be paragraph-wrapped.
8. Raw HTML enabled:
   - with `rawHtml: true`, `<em>x</em>` should pass through.
9. Known sanitizer gap:
   - `[bad](javascript:alert(1))` currently renders an unsafe `href`.
   - Document this with a concise test or comment so the next milestone has an explicit target.
   - This is not approval of the behavior; it records the smoke integration limitation.

Prefer exact small string assertions over large snapshots in this milestone. Add snapshots later when the email renderer stabilizes.

### 4. Add minimal CLI integration test if it stays simple

Optional but recommended if not too noisy:

- Add `test/cli.test.ts` using `Bun.spawn` or `$` to run `bun run src/cli.ts` against a temp Markdown file.
- Assert output file contains rendered `<h1>Hello</h1>` and no placeholder `<pre>`.

If this becomes verbose, skip for now and rely on manual CLI verification plus `markdown.test.ts`.

### 5. Manual verification

Run:

```bash
printf '# Hello\n\nThis is **bold**.' > /tmp/mdtoemail-satteri.md
bun run src/cli.ts /tmp/mdtoemail-satteri.md -o /tmp/mdtoemail-satteri.html
cat /tmp/mdtoemail-satteri.html
```

Expected:

- output contains `<h1>Hello</h1>`
- output contains `<strong>bold</strong>`
- output does not wrap source Markdown in `<pre>`

Raw HTML config checks:

```bash
printf '<em>Hello</em>' > /tmp/mdtoemail-raw.md
bun run src/cli.ts /tmp/mdtoemail-raw.md -o /tmp/mdtoemail-raw-default.html
cat /tmp/mdtoemail-raw-default.html

cat > /tmp/mdtoemail-raw.toml <<'TOML'
[markdown]
raw_html = true
TOML
bun run src/cli.ts /tmp/mdtoemail-raw.md --config /tmp/mdtoemail-raw.toml -o /tmp/mdtoemail-raw-enabled.html
cat /tmp/mdtoemail-raw-enabled.html
```

Expected:

- default output escapes `<em>`.
- configured output includes `<em>Hello</em>`.

Compiled binary verification:

```bash
bun run compile
./dist/mdtoemail /tmp/mdtoemail-satteri.md -o /tmp/mdtoemail-satteri-compiled.html
```

Expected:

- compiled binary still works with Sätteri.
- If compilation fails because of Sätteri native packaging, do not work around blindly. Investigate Bun/Sätteri docs and decide whether compiled binaries should be deferred or the build config adjusted.

## Files likely to change

```txt
src/cli.ts
src/markdown.ts
test/markdown.test.ts
```

Possible optional file:

```txt
test/cli.test.ts
```

No config schema changes are expected.

## Interface changes

No CLI option changes.

Behavior change:

- Output now contains rendered Markdown HTML instead of escaped source Markdown in `<pre>`.
- `markdown.gfm` and `markdown.frontmatter` now affect conversion.
- `markdown.raw_html = false` now escapes raw HTML nodes before rendering.
- `markdown.raw_html = true` allows Sätteri raw HTML pass-through.

## Testing and verification plan

Automated:

```bash
bun test
bun run typecheck
bun run build
bun run compile
```

Manual:

```bash
bun run src/cli.ts --help
bun run src/cli.ts --version
printf '# Hello\n\nThis is **bold**.' > /tmp/mdtoemail-satteri.md
bun run src/cli.ts /tmp/mdtoemail-satteri.md -o /tmp/mdtoemail-satteri.html
grep '<h1>Hello</h1>' /tmp/mdtoemail-satteri.html
grep '<strong>bold</strong>' /tmp/mdtoemail-satteri.html
./dist/mdtoemail /tmp/mdtoemail-satteri.md -o /tmp/mdtoemail-satteri-compiled.html
```

Error cases to re-check:

```bash
bun run src/cli.ts
bun run src/cli.ts --unknown
bun run src/cli.ts /tmp/missing.md
bun run src/cli.ts /tmp/mdtoemail-satteri.md --config /tmp/missing.toml
```

## Risks, edge cases, and mitigations

### Raw HTML handling is not final sanitization

Risk: Escaping MDAST `html` nodes helps for raw Markdown HTML, but it does not sanitize all unsafe final HTML generated by Markdown constructs or future plugins.

Concrete example: `[bad](javascript:alert(1))` may render an unsafe `<a href="javascript:alert(1)">bad</a>` until URL validation is implemented.

Mitigation: Clearly document this as smoke behavior. Add a known-gap test/comment. Next milestone should implement sanitizer/email renderer.

### GFM task lists emit `<input>` elements

Risk: Sätteri emits checkbox inputs for task lists, which are poor email markup and likely unsupported/sanitized by clients.

Mitigation: Add a test documenting current behavior. Next milestone should replace task list inputs with email-safe text or styled symbols.

### `theme.linkColor` is not yet applied to generated links

Risk: Users may expect `link_color` to affect links once links render as `<a>` tags.

Mitigation: Call this out as a known limitation. Link styling belongs to the next email renderer/inline style milestone.

### `raw_html = true` can generate unsafe HTML

Risk: Allowing raw HTML pass-through can output scripts/forms/iframes.

Mitigation: Keep default `false`. Treat `true` as an explicit unsafe escape hatch until sanitizer exists. Revisit once diagnostics/strict mode are added.

### Sätteri native dependency and `bun build --compile`

Risk: Sätteri native napi bindings may not package cleanly in Bun standalone executables.

Mitigation: Run the compile spike first and repeat compiled binary verification after implementation. If it fails, investigate instead of adding hacks.

### Direct HTML insertion into wrapper

Risk: `contentHtml` is intentionally inserted without escaping. This is correct for rendered Markdown but can propagate unsafe HTML when `raw_html = true` or unsafe URLs are generated.

Mitigation: Keep raw HTML disabled by default. Sanitizer is next.

### Frontmatter behavior may surprise users

Risk: With frontmatter enabled, Sätteri removes frontmatter from output and returns it separately. The CLI currently does nothing with returned frontmatter.

Mitigation: Test this behavior and document it as a current limitation. Future plan can use frontmatter for title/metadata if desired.

## Rollout/backward compatibility

- This intentionally changes output from placeholder debug HTML to rendered Markdown HTML.
- No CLI flags or config keys change.
- Existing config files remain valid.
- Unknown config keys remain ignored.

## Claude review notes incorporated

The draft plan was reviewed with the Claude CLI. Useful feedback incorporated:

- Verified Sätteri API assumptions against installed type declarations.
- Corrected wording: frontmatter is extracted as raw text, not parsed into structured data.
- Moved Sätteri/Bun standalone compile risk to a pre-flight task.
- Made `renderMarkdown` consistently return `Promise<RenderedMarkdown>`.
- Added explicit render error wrapping in the CLI plan.
- Added explicit known sanitizer gap for unsafe generated URLs such as `javascript:` links.
- Called out `theme.linkColor` as currently inactive until element-level inline styling exists.

## Open questions

None for this milestone.

## Next milestone after this

Email-safe rendering/sanitization:

1. Decide whether to continue with `markdownToHtml` plus HTML post-processing or switch to `markdownToHast` plus custom renderer.
2. Add an allowlist for supported tags/attributes.
3. Remove or transform unsupported elements such as `input`, `script`, `style`, `iframe`, `form`.
4. Validate link/image protocols.
5. Add element-level inline styles.
6. Add a conservative table-based outer email wrapper.
7. Add diagnostics/warnings for unsafe or problematic content.
