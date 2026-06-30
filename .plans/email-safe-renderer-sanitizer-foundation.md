# Plan: Email-Safe Renderer and Sanitizer Foundation

## Summary

Add the first real email-safe rendering layer on top of Sätteri. This milestone should turn Sätteri’s normal web HTML into conservative, mostly email-compatible HTML by sanitizing/normalizing generated HAST nodes before serialization, applying inline styles to core Markdown elements, validating URLs, transforming GFM task-list inputs, preserving default-on GFM footnotes, and replacing the current `<main>` wrapper with a table-based email shell.

This plan intentionally covers the next five product steps in one milestone:

1. Add a sanitizer/normalizer layer after Sätteri parsing.
2. Strip or transform unsafe/problematic elements.
3. Validate link and image URL protocols.
4. Add inline styles for core Markdown output.
5. Replace the simple wrapper with a conservative table-based email layout.

Diagnostics, strict mode, rich config expansion, arbitrary CSS support, custom raw-HTML parsing, and final production-grade email-client testing remain later milestones.

## Clarification status

No clarification is needed. The user explicitly asked for one detailed plan covering steps 1–5.

## Confirmed requirements and assumptions

- Use TypeScript and Bun.
- Keep implementation simple and incremental.
- Add no new dependencies.
- Continue using pinned `satteri@0.9.4`.
- Do not add a server.
- Preserve the existing CLI shape:
  - `mdtoemail input.md`
  - `-o/--output`
  - `-c/--config`
  - `--help`, `--version`
- Keep TOML config schema unchanged in this milestone unless absolutely necessary.
- Use existing theme/config values where possible:
  - `email.containerWidth`
  - `theme.backgroundColor`
  - `theme.containerBackground`
  - `theme.textColor`
  - `theme.linkColor`
  - `theme.fontFamily`
  - `theme.baseFontSize`
  - `theme.lineHeight`
  - `theme.contentPadding`
- Favor conservative email markup:
  - table-based outer layout
  - inline styles
  - simple CSS properties
  - no JavaScript/forms/iframes/interactive inputs
- Raw HTML is not a security boundary today. This milestone should make default output safer, but full diagnostics/strict failure behavior comes later.

## Relevant research findings

### Project/codebase findings

Current committed foundation:

- `src/cli.ts`
  - loads config
  - reads Markdown
  - calls `renderMarkdown(markdown, config)`
  - wraps HTML in a simple document with `<main>`
  - writes output
- `src/markdown.ts`
  - imports `markdownToHtml` and `defineMdastPlugin` from Sätteri
  - maps `markdown.gfm` and `markdown.frontmatter` to Sätteri `features`
  - escapes raw Markdown HTML by default using an MDAST `html` visitor
  - returns `{ html, frontmatter }`
- `src/config.ts`
  - already has Markdown, email, and theme settings needed for this milestone
- `test/markdown.test.ts`
  - documents current GFM task-list `<input>` output
  - documents current unsafe `javascript:` URL gap
- `test/cli.test.ts`
  - verifies CLI renders Markdown, not placeholder `<pre>`

### Sätteri findings

Sources:

- `node_modules/satteri/dist/compile.d.ts`
- `node_modules/satteri/dist/types.d.ts`
- Sätteri docs previously fetched:
  - `https://satteri.bruits.org/docs/features/`
  - `https://satteri.bruits.org/docs/plugin-api/`
  - `https://satteri.bruits.org/docs/plugins/`

Findings:

- `markdownToHtml(source, options)` accepts `mdastPlugins` and `hastPlugins`.
- HAST plugins can visit elements via filtered `element` visitors.
- A filtered element visitor with `filter: []` matches all elements.
- HAST `raw` visitors are supported.
- Visitors can mutate through context methods such as `ctx.setProperty(...)`, `ctx.removeNode(...)`, and `ctx.replaceNode(...)`.
- Empirical check: `ctx.setProperty(node, "href", undefined)` removes the serialized attribute, and `ctx.setProperty(node, "style", "...")` adds/replaces it.
- Avoid returning replacement parent elements from a match-all visitor. Sätteri’s arena/patch model can drop nested patches when both parent and child are replaced in the same pass. Prefer in-place mutation for elements and only replace leaf nodes such as `<input>`.
- Sätteri-generated task lists currently produce:
  - `<ul class="contains-task-list">`
  - `<li class="task-list-item">`
  - `<input type="checkbox" checked disabled>`
- Sätteri-generated links can include unsafe `href` values like `javascript:alert(1)`.
- Sätteri-generated images can include unsafe or email-unfriendly `src` values.
- GFM footnotes are enabled by default when `gfm` is true and produce a `<section>` wrapper with attributes/classes, plus heading/list/backref links.

### Email HTML compatibility findings

Sources from prior and current research:

- Campaign Monitor HTML email guide: `https://www.campaignmonitor.com/dev-resources/guides/coding-html-emails/`
- Campaign Monitor CSS guide: `https://www.campaignmonitor.com/css/`
- Mailchimp CSS/email docs:
  - `https://templates.mailchimp.com/development/html/`
  - `https://templates.mailchimp.com/development/css/`
  - `https://mailchimp.com/help/css-in-html-email/`

Findings:

- Use table-based layout for broad compatibility, especially with Outlook desktop.
- Prefer inline CSS over external or embedded CSS.
- Keep CSS simple and conservative.
- Avoid JavaScript, forms, iframes, video/audio, and other interactive or embedded content.
- Use explicit widths/HTML attributes where useful.
- Email-client support varies; this milestone improves default output but does not replace real client testing.

## Chosen implementation strategy

Use Sätteri’s existing `markdownToHtml` pipeline, but add a HAST plugin before serialization.

Add one focused module:

```txt
src/email.ts
```

Responsibilities:

- Export an email-safe HAST plugin factory:

```ts
export function emailHastPlugin(config: Config): HastPluginInput;
```

- Export a table-based document wrapper:

```ts
export function renderEmailDocument(contentHtml: string, inputPath: string, config: Config): string;
```

- Own small local helpers for:
  - inline style serialization
  - URL protocol validation
  - safe attribute mutation
  - task checkbox conversion

Update `src/markdown.ts` to pass the plugin:

```ts
const result = await markdownToHtml(markdown, {
  features: markdownFeatures(config),
  mdastPlugins: config.markdown.rawHtml ? [] : [escapeRawHtml],
  hastPlugins: [emailHastPlugin(config)],
});
```

Update `src/cli.ts` to call `renderEmailDocument(...)` instead of its local `renderHtmlDocument(...)`, then remove the old wrapper/style helpers from the CLI.

### Key implementation rule: mutate element nodes in place

For the match-all HAST element visitor, do **not** return replacement elements for every allowed tag. Instead:

- mutate allowed elements with `ctx.setProperty(...)`;
- remove disallowed attributes by iterating existing `node.properties` keys and setting disallowed keys to `undefined`;
- set final allowed/style attributes in place;
- use replacement only for leaf/problematic nodes like task-list `<input>`.

Reason: replacing both parent and child nodes in the same Sätteri plugin pass can drop nested transformations. In-place mutation preserves node identity and avoids that class of bugs.

### Why not switch to `markdownToHast` + custom serializer now?

A custom HAST renderer/serializer is likely the long-term best route, but it is a bigger jump. Sätteri already provides a HAST plugin phase before HTML serialization. Using that phase now lets us sanitize, normalize, and style output with much less code and no dependency. If Sätteri serialization later becomes too limiting, we can switch to `markdownToHast` with tests already defining expected email-safe output.

## Alternatives considered

### 1. Post-process rendered HTML strings

Rejected. Without an HTML parser dependency, string post-processing is fragile and unsafe for nested tags, quoted attributes, entity escaping, and malformed HTML.

### 2. Add an HTML parser/sanitizer dependency

Rejected for this milestone. The project strongly prefers minimal dependencies. Sätteri already gives access to HAST before serialization, which is enough for generated Markdown output.

### 3. Switch immediately to `markdownToHast` and write a full custom renderer

Rejected for this milestone. It gives maximum control but creates a larger serializer project. HAST plugins are enough to make a meaningful email-safe improvement now.

### 4. Return replacement elements from a match-all HAST visitor

Rejected after review. It risks dropped nested patches when parent and child are both replaced in the same plugin pass. Prefer in-place mutation.

### 5. Keep output mostly as Sätteri HTML and only change the wrapper

Rejected. The known unsafe URL and task-list input gaps would remain. This milestone should address those obvious generated-output issues.

### 6. Fully implement diagnostics/strict mode now

Rejected. Diagnostics are important, and Sätteri plugin context already has `ctx.report(...)`, but adding warning collection, CLI display, strict failure behavior, and config keys would expand scope. Tests can document behavior now; diagnostics can follow.

## Target behavior

### Allowed/generated elements

Keep and style these core Markdown tags:

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
section
```

Notes:

- `section` is included primarily to preserve GFM footnotes, which are enabled by default with GFM.
- If Sätteri emits `span` for a supported Markdown feature in current tests, allow and strip/style it minimally; otherwise keep it out until needed.

### Unsupported/problematic elements

Handle conservatively:

- `input` from GFM task lists:
  - replace checkbox inputs with text symbols:
    - checked: `☑ `
    - unchecked: `☐ `
- `script`, `style`, `iframe`, `object`, `embed`, `video`, `audio`, `form`, `button`, `textarea`, `select`, `svg`, `canvas`, `link`, `meta`:
  - remove the element for now.
  - do not overbuild child-preserving unwrap logic in this milestone.
- unknown elements:
  - remove for now unless testing shows Sätteri uses one for a default supported Markdown feature.

Because Sätteri-generated Markdown output is predictable, unsupported element handling primarily needs to handle `input` now; the broader list is a safety net for future features/plugins/raw HTML.

### Attribute policy

Strip existing attributes by default and re-add only known-safe attributes/styles.

Implementation approach:

1. In the element visitor, get `node.properties`.
2. Iterate property keys and remove each one via `ctx.setProperty(node, key, undefined)`.
3. Add back only allowed attributes and inline `style`.

Suggested initial attributes:

- `a`
  - keep `href` only if protocol is allowed
  - add inline `style`
- `img`
  - keep `src` only if protocol is allowed for images
  - keep `alt` when string
  - optionally keep numeric/string `width` and `height`
  - add inline `style`
- table elements
  - add simple inline styles
  - for Markdown data tables, do not add `role="presentation"`
- `section`
  - strip classes/data attributes from footnotes
  - add simple spacing/border style if desired
- no class names from Sätteri should remain in output.

Known fidelity tradeoff:

- GFM table alignment may be lost if Sätteri emits alignment attributes/styles. Accept this for now and revisit with style config or table-specific logic later.

### URL protocol policy

Initial allowed protocols:

- links: `https:`, `http:`, `mailto:`, `tel:`
- images: `https:`, `http:`

Also allow relative URLs for now:

- `/path`
- `./path`
- `../path`
- `#anchor`

Disallow/remove:

- `javascript:`
- `data:`
- `file:`
- unknown explicit protocols
- protocol-relative URLs such as `//example.com/image.png`
- values containing ASCII control characters after trimming

Implementation helper:

```ts
export function isAllowedUrl(value: unknown, kind: "link" | "image"): value is string;
```

Important implementation detail:

- Validate parsed protocol with `new URL(...)` if helpful, but re-emit the original trimmed string, not `url.href`, so relative URLs are not rewritten.
- Reject protocol-relative strings before calling `new URL(...)` because `new URL("//evil.com", base)` resolves to an allowed-looking `https:` URL.
- Test mixed-case and obfuscated protocols such as `JAVASCRIPT:alert(1)` and `java\tscript:alert(1)`.

### Inline styles

Add conservative inline styles for these elements:

- `p`
- `h1`, `h2`, `h3`
- `h4`, `h5`, `h6`
- `a`
- `ul`, `ol`, `li`
- `blockquote`
- `code`
- `pre`
- `hr`
- `img`
- `table`, `th`, `td`
- `section` for footnotes if needed

Use existing config values where practical:

- body/container fonts and colors from `theme`
- links use `theme.linkColor`
- headings use `theme.textColor`
- table borders use a hardcoded conservative color for now, e.g. `#dddddd`, because no `borderColor` token exists yet.
- code background can be a hardcoded light color for now, e.g. `#f3f4f6`, because no `codeBackground` token exists yet.

Keep styles simple:

- margins/padding
- font size/line height
- color
- border/border-collapse
- max-width for images
- no CSS variables
- no flex/grid
- no complex selectors

### Table-based email wrapper

Replace the current simple wrapper with:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>...</title>
  </head>
  <body style="margin:0;padding:0;background:...;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:...;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:...;">
            <tr>
              <td style="padding:...;font-family:...;font-size:...;line-height:...;color:...;">
                <!-- sanitized/styled Markdown HTML -->
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

Use `config.email.containerWidth` for the inner table `width` attribute and style.

## Implementation tasks

### 1. Add `src/email.ts`

Exports:

```ts
import { defineHastPlugin, type HastPluginInput } from "satteri";
import type { Config } from "./config";

export function emailHastPlugin(config: Config): HastPluginInput { ... }
export function renderEmailDocument(contentHtml: string, inputPath: string, config: Config): string { ... }
export function isAllowedUrl(value: unknown, kind: "link" | "image"): value is string { ... }
```

Keep everything in this one file for now to avoid premature structure.

Internal helpers:

- `styleAttribute(styles: Record<string, string | number | undefined>): string`
- `styleForTag(tagName: string, config: Config): string | undefined`
- `stripProperties(node, ctx): void`
- `applySafeProperties(node, ctx, config): void`
- `isCheckedCheckbox(properties: Record<string, unknown>): boolean`

Notes:

- Export `isAllowedUrl` because direct URL tests are valuable.
- Keep other helpers local unless tests truly need them.
- Use `Bun.escapeHTML` when generating wrapper/title/style strings manually.

### 2. Implement HAST element normalization with in-place mutation

Use one `defineHastPlugin` with:

```ts
export function emailHastPlugin(config: Config): HastPluginInput {
  return defineHastPlugin({
    name: "email-sanitizer",
    element: {
      filter: [],
      visit(node, ctx) {
        // inspect node.tagName
        // mutate allowed nodes in place
        // replace only leaf nodes like input
        // remove unsupported nodes
      },
    },
    raw(node) {
      return { type: "text", value: node.value };
    },
  });
}
```

Important behavior:

- For allowed tags:
  - remove all current properties by iterating `node.properties` and calling `ctx.setProperty(node, key, undefined)`.
  - add back allowed URL/alt/width/height/style properties.
  - return `undefined` / `void`.
- For `input` checkbox:
  - return `{ type: "text", value: checked ? "☑ " : "☐ " }`.
- For unsupported tags:
  - `ctx.removeNode(node)` and return `undefined`.
- For HAST `raw` nodes:
  - return text node so raw HTML is escaped by Sätteri serialization.

Before completing the full implementation, run a tiny local smoke check or unit test to verify:

- unsetting properties with `undefined` removes serialized attributes;
- nested elements all receive styles, e.g. link inside list item and table cells inside table rows.

### 3. Wire the plugin into `src/markdown.ts`

Update imports:

```ts
import { emailHastPlugin } from "./email";
```

Update `markdownToHtml` call:

```ts
hastPlugins: [emailHastPlugin(config)],
```

Raw HTML policy for this milestone:

- Keep current MDAST raw HTML escape plugin for `raw_html = false`.
- The HAST `raw` visitor should escape raw nodes as a second safety layer.
- Recommended behavior: raw HAST nodes are escaped even when `raw_html = true` because safe raw HTML passthrough requires a real HTML parser/sanitizer.
- This means `raw_html = true` no longer allows final raw HTML passthrough once the email-safe renderer is active. Keep the config key for now, but document/test that email-safe output escapes raw chunks.

### 4. Update `src/cli.ts`

Import:

```ts
import { renderEmailDocument } from "./email";
```

Replace:

```ts
const html = renderHtmlDocument(renderedHtml, input, config);
```

With:

```ts
const html = renderEmailDocument(renderedHtml, input, config);
```

Delete local wrapper helpers from `src/cli.ts`:

- `renderHtmlDocument`
- `styleAttribute`

Keep CLI focused on argument parsing, config, file I/O, and error handling.

### 5. Update tests

#### `test/markdown.test.ts`

Update tests whose expected behavior changes:

- Task lists:
  - no longer expect `<input>`.
  - expect `☑` and `☐` text.
  - expect Sätteri task-list classes to be stripped.
- Unsafe URL gap:
  - change from documenting gap to verifying fix:
    - `[bad](javascript:alert(1))` should not contain `javascript:`.
    - link text should remain.
- Raw HTML enabled:
  - update to expect escaped raw HTML even with `rawHtml: true` under email-safe rendering.
- Links:
  - expect `href="https://example.com"` remains.
  - expect inline style containing `color:${defaultConfig.theme.linkColor}`.
- GFM tables:
  - expect table remains and contains border/cell styles.
- GFM footnotes:
  - expect footnote text remains.
  - expect no `class="footnotes"` or `data-footnotes` attributes.
  - expect safe backref `href="#..."` remains.

Add tests for:

- nested mutation:
  - link inside list item receives link style.
  - table cells receive cell styles.
- image URL validation:
  - `![x](javascript:alert(1))` removes `src` or removes image.
  - `![Alt](https://example.com/a.png)` keeps safe `src` and `alt`.
- disallowed raw/unsupported elements:
  - raw `<iframe>` does not appear in output.
- protocol-relative and obfuscated URLs:
  - `[bad](//example.com)` rejected.
  - `[bad](JAVASCRIPT:alert(1))` rejected.
  - `[bad](java\tscript:alert(1))` rejected.

#### `test/cli.test.ts`

Update/extend CLI integration test:

- output contains table-based wrapper with `role="presentation"`.
- output contains rendered Markdown.
- output does not contain `<main>` or `<pre>`.

#### Add `test/email.test.ts`

Recommended for focused tests:

- `renderEmailDocument(...)` wrapper structure.
- `isAllowedUrl(...)` allowed/disallowed URL matrix.

Keep tests small and behavior-focused.

### 6. Manual verification

Run:

```bash
printf '# Hello\n\n[Site](https://example.com)\n\n[Bad](javascript:alert(1))\n\n- [x] Done\n- [ ] Todo' > /tmp/mdtoemail-email.md
bun run src/cli.ts /tmp/mdtoemail-email.md -o /tmp/mdtoemail-email.html
cat /tmp/mdtoemail-email.html
```

Expected:

- table-based wrapper exists.
- `<h1>` and links are rendered with inline styles.
- safe link remains.
- `javascript:` does not appear.
- task list has `☑` / `☐`, not `<input>`.
- no `<main>` or `<pre>`.

Also verify existing commands:

```bash
bun run src/cli.ts --help
bun run src/cli.ts --version
bun run src/cli.ts /tmp/missing.md
```

## Files likely to change

```txt
src/cli.ts
src/markdown.ts
src/email.ts
test/markdown.test.ts
test/cli.test.ts
test/email.test.ts
```

Possible:

```txt
PROJECT.md
```

`PROJECT.md` only needs updates if behavior or known caveats should be recorded there immediately.

## Interface/config changes

No CLI flags.

No TOML schema changes planned.

Behavior changes:

- output wrapper becomes table-based.
- core Markdown elements receive inline styles.
- unsafe link/image URLs are removed or neutralized.
- GFM task-list checkbox inputs are transformed into text symbols.
- Sätteri class names and unsafe generated attributes are stripped.
- GFM footnote content is preserved, but attributes/classes are sanitized.
- raw HAST chunks are escaped as text by the email renderer.
- `raw_html = true` no longer produces final raw HTML passthrough in email-safe output; this is intentional until a raw HTML sanitizer/parser exists.

## Testing and verification plan

Automated:

```bash
bun test
bun run typecheck
bun run build
```

Compile:

```bash
bun run compile
```

Known caveat from previous milestone:

- `bun run compile` may succeed, but the compiled binary cannot load Sätteri’s native binding by itself.
- On this machine it worked only with:

```bash
NAPI_RS_NATIVE_LIBRARY_PATH="$PWD/node_modules/@bruits/satteri-darwin-arm64/satteri_napi.darwin-arm64.node" ./dist/mdtoemail ...
```

Do not treat standalone binary packaging as solved by this milestone.

Manual output inspection:

```bash
bun run src/cli.ts /tmp/mdtoemail-email.md -o /tmp/mdtoemail-email.html
```

Check for absence of:

```txt
javascript:
<input
<script
<iframe
<main
<pre
class="contains-task-list"
class="task-list-item"
```

Check for presence of:

```txt
role="presentation"
<h1 style=
<a href="https://example.com" style=
☑
☐
```

## Risks, edge cases, and mitigations

### Match-all HAST plugins can accidentally drop nested transformations

Risk: Returning replacement parent elements while also replacing children can drop nested patches in Sätteri’s plugin model.

Mitigation: Mutate allowed elements in place. Replace only leaf/problematic nodes like `<input>`. Add nested tests for links in list items and cells in tables.

### Raw HTML cannot be safely parsed without an HTML parser

Risk: If `raw_html = true`, raw HTML chunks could contain anything and cannot be sanitized structurally without adding an HTML parser.

Mitigation: Escape HAST `raw` nodes in the email renderer even when `rawHtml` is true. Document this as safer email output behavior. If users need raw HTML passthrough, that should become a separate advanced/unsafe mode later.

### Removing unsupported elements can drop useful text

Risk: Removing whole unsupported nodes can lose text content.

Mitigation: For current Sätteri-generated Markdown, unsupported elements are mainly task-list inputs, which are intentionally transformed. GFM footnotes are explicitly allowed via `section`. Broad unsupported removal is a safety net. Later diagnostics can report dropped content.

### Footnotes and future generated elements need care

Risk: GFM footnotes are default-on and use `section`; future features may emit other wrappers.

Mitigation: Preserve `section` now. Add a footnote regression test. Keep future feature enablement conservative.

### Inline styles may still not be perfect for all email clients

Risk: Email support varies by client.

Mitigation: Use conservative CSS only, table wrapper, and tests for stable output. Real client testing and more compatibility tuning come later.

### URL validation subtleties

Risk: URLs can be obfuscated with whitespace/control characters, mixed case, entities, or protocol-relative forms.

Mitigation: Trim values, reject ASCII control chars, reject protocol-relative URLs before parsing, parse explicit protocols with `URL`, and test common dangerous cases. Do not claim full sanitizer completeness yet.

### Attribute stripping can remove useful Markdown fidelity

Risk: Table alignment and footnote screen-reader classes may be lost.

Mitigation: Accept for this foundation milestone. Preserve content first; refine fidelity/accessibility later.

### Over-scoping into a full renderer

Risk: This milestone could balloon into a full email client compatibility project.

Mitigation: Limit to core Markdown tags, simple inline styles, clear allowlist, obvious unsafe elements, and wrapper. Defer diagnostics, strict mode, style config expansion, buttons/callouts, and full client testing.

## Claude review notes incorporated

The draft plan was reviewed with the Claude CLI. Useful feedback incorporated:

- Switched from replacement elements to in-place HAST mutation to avoid dropped nested transformations in Sätteri’s patch model.
- Added explicit `section` support for default-on GFM footnotes.
- Added a required pre-test/implementation check for `ctx.setProperty(..., undefined)` attribute removal; empirically verified it removes serialized attributes.
- Expanded URL validation details for protocol-relative, uppercase, and control-character-obfuscated URLs.
- Called out table alignment as a known fidelity regression.
- Made `raw_html = true` behavior change explicit: email-safe output should escape raw HAST chunks until a real raw HTML sanitizer exists.
- Added nested transformation and footnote tests to the plan.

## Open questions

None requiring user input.

Implementation decision recorded:

- Raw HAST nodes should be escaped in email-safe output, even when `raw_html = true`, because safe passthrough requires an HTML parser or a more advanced raw HTML sanitizer.

## Next milestone after this

Diagnostics and strict mode:

- Collect warnings for removed unsafe URLs/elements, raw HTML escaping, missing image alt text, wide tables, and long code lines.
- Add config fields only when implemented, e.g. `[email] warnings = true`, `strict = false`.
- Print warnings to stderr.
- Optionally fail on warnings in strict mode.
