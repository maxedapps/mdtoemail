# Plan: Email Compatibility Hardening

## Summary

Harden `mdtoemail`'s generated HTML, attributes, CSS, URL policy, diagnostics, and theme validation so output is more conservative and more likely to render consistently across common email clients, including older Outlook/Word-based clients.

This milestone does **not** add sending, image hosting, CID attachments, a visual testing service, or a full custom HAST renderer. It improves the current Sätteri HAST plugin and wrapper renderer with stricter policies, legacy email attributes, conservative CSS, clearer diagnostics, and tests.

## Clarification status

No clarification is needed. The user wants broad email-client coverage, including older clients, and asked for a plan implementing the identified hardening fixes.

## Confirmed requirements and assumptions

- TypeScript + Bun.
- Keep pinned `satteri@0.9.4`.
- No new dependencies.
- Keep implementation simple and incremental.
- CLI-only: Markdown in, email HTML out.
- No sending, SMTP/provider integrations, image upload/hosting, CID attachment management, tracking, or server.
- Prefer conservative HTML email patterns over modern web HTML patterns.
- Use inline styles and legacy HTML attributes where they improve old-client compatibility.
- Keep safe token-based theming, but strengthen compatibility validation without over-engineering it.
- Do not promise universal rendering. Target broad compatibility and document remaining caveats.

## Relevant research findings

Primary compatibility references:

- Can I Email: <https://www.caniemail.com/>
  - Client-by-client feature support for CSS/HTML in email.
- Campaign Monitor CSS support: <https://www.campaignmonitor.com/css/>
  - CSS support across Gmail, Outlook, Apple Mail, Yahoo/AOL, mobile clients.
- Campaign Monitor HTML email coding guide: <https://www.campaignmonitor.com/dev-resources/guides/coding-html-emails/>
  - Practical table-based and inline-CSS email guidance.
- Mailchimp HTML email basics: <https://templates.mailchimp.com/getting-started/html-email-basics/>
  - Recommends table-based structure, inline CSS, simple layouts, and 600-ish pixel widths.
- Gmail CSS support: <https://developers.google.com/workspace/gmail/design/css>
  - Gmail supports a subset of CSS in email; do not depend on Gmail-only behavior.
- Cerberus email best practices: <https://www.cerberusemail.com/best-practices>
  - Pragmatic Outlook-friendly email patterns, including table spacing resets and conservative CSS.

Research synthesis:

- Table-based layout remains the most reliable baseline.
- Legacy attributes such as `width`, `align`, `valign`, `cellpadding`, `cellspacing`, `border`, and `bgcolor` are deprecated on the web but useful in email fallbacks.
- Inline styles are safer than external CSS or `<style>` blocks.
- Modern layout CSS (`flex`, `grid`, positioning, transforms, CSS functions, advanced selectors) should not appear.
- `max-width`, margins, and `overflow` are not uniformly reliable in older clients. Use them only as enhancements, not sole layout mechanisms.
- Remote HTTPS images are the practical default for standalone email HTML. Relative, local, `data:`, and `cid:` images should not be emitted unless a later explicit workflow supports them.
- Outlook-specific CSS such as `mso-table-lspace:0pt`, `mso-table-rspace:0pt`, and `-ms-interpolation-mode:bicubic` is common in production email HTML.

## Current-state/codebase findings

Relevant files:

- `src/email.ts`
  - Contains `emailHastPlugin(...)`, URL validation, sanitizer/normalizer logic, inline style generation, and `renderEmailDocument(...)` wrapper.
  - Current allowed content elements include `section` for footnotes.
  - Current wrapper uses table layout with `role="presentation"`, `width`, `cellspacing`, `cellpadding`, `border`, and inline styles.
  - Current Markdown table output relies mostly on CSS, not fallback attrs.
  - Current URL policy allows relative URLs for both links and images.
  - Current image handling preserves `src`, `alt`, `width`, `height`, and adds inline styles.
  - Current code block style uses `overflow:auto`.
- `src/markdown.ts`
  - Calls `markdownToHtml(...)` with Sätteri features and `emailHastPlugin(config, diagnostics)`.
  - `config.markdown.rawHtml` is currently not passed through; raw HTML is escaped by plugin regardless.
- `src/config.ts`
  - Defines `Config`, defaults, project config loading, theme loading, merge order, and style token validation.
  - Current style validation is injection-focused, not specifically old-email-compatibility-focused.
  - Theme files are restricted to appearance/layout fields.
- `src/diagnostics.ts`
  - Current diagnostic codes: `unsafe-link-url`, `unsafe-image-url`, `unsupported-element`, `raw-html-escaped`, `task-list-input-transformed`.
- Tests:
  - `test/email.test.ts`: URL policy and wrapper tests.
  - `test/markdown.test.ts`: Markdown rendering, sanitizer, tables, task lists, raw HTML, unsafe URLs, images, footnotes, theme tokens.
  - `test/config.test.ts`: config/theme merging and unsafe CSS token rejection.
  - `test/cli.test.ts`: CLI rendering, diagnostics, strict mode, themes.

Current generated HTML/CSS areas to harden:

- Relative image URLs are allowed.
- `http:` images are allowed without warning.
- Missing image alt text has no diagnostic.
- Removed images disappear completely; alt text is lost.
- Markdown table elements do not get enough legacy attrs.
- Table cell alignment is style-only; `align` attr should also be set.
- Wrapper lacks `bgcolor` attrs and Outlook table spacing resets.
- Inner wrapper uses fixed `style="width:600px;max-width:600px"`; this can hurt mobile clients. Prefer fluid-hybrid: `width="600"` attr plus `style="width:100%;max-width:600px"`.
- `<section>` is allowed/styled for footnotes; old clients are safer with `div` or table/plain block.
- Code blocks use `overflow:auto`; safer wrapping behavior is preferable, with caveats.
- Theme validation allows modern CSS values that are not injection risks but are poor old-client CSS.
- `raw_html` config is effectively a no-op and should be clearly documented as reserved or removed.

## Chosen implementation strategy

Continue using the existing Sätteri HAST plugin and wrapper renderer, but make them more email-specific:

1. Add tests that verify Sätteri/HAST property names serialize to the intended legacy HTML attributes.
2. Strengthen URL policy with separate link/image decisions and a single decision path per node.
3. Add diagnostics for risky but possibly allowed constructs.
4. Add old-client fallback HTML attributes to wrapper, images, and Markdown tables.
5. Use a fluid-hybrid wrapper width pattern for mobile + Outlook.
6. Replace web-ish CSS where possible with conservative email CSS.
7. Normalize/avoid `<section>` in output if Sätteri plugin APIs support it safely.
8. Strengthen theme validation with a focused denylist of modern/fragile CSS constructs, not a broad per-token allowlist yet.
9. Expand tests to assert emitted HTML/attrs/styles and rejected config values.
10. Update docs/examples to reflect stricter behavior.

Rationale:

- Incremental and fits the current architecture.
- Keeps Sätteri as parser/serializer and avoids a large custom renderer rewrite.
- Centralizes policy in `src/email.ts` and `src/config.ts`.
- No new dependencies.
- Addresses the highest-value compatibility risks now while leaving full visual testing and custom rendering for later.

## Alternatives considered

### 1. Rewrite output with a custom HAST-to-email renderer now

Rejected for this milestone. It would provide maximum control but is significantly larger and riskier. The current plugin approach can solve most immediate compatibility issues with less churn.

### 2. Add MJML, Juice, Premailer, or another email framework/inliner

Rejected. The project constraints prefer no new dependencies and custom conservative output. Sätteri already handles Markdown parsing.

### 3. Remove all Markdown tables/images until fully proven

Rejected. Images and tables are important email features and already in project scope. Safer normalization and diagnostics are better than removal.

### 4. Build a large per-token CSS allowlist now

Rejected after review. It would be high-effort, reject some compatible CSS values, and require ongoing maintenance. Use the existing injection validation plus a focused denylist of known fragile modern constructs first. Add narrower semantic validators later if needed.

### 5. Ban all `http:` links and images

Partially rejected. For images, default should be HTTPS-only. For links, preserving `http:` with a warning is practical and less destructive.

## Implementation tasks

### 1. Add Sätteri serialized-attribute verification tests first

Before changing legacy attributes in the HAST plugin, verify the property names Sätteri expects.

Important: HAST usually uses property names such as:

```txt
cellPadding -> cellpadding
cellSpacing -> cellspacing
vAlign -> valign
bgColor -> bgcolor
className -> class
```

Current code only sets casing-identical attrs (`href`, `src`, `alt`, `width`, `height`, `style`, `id`), so this has not been tested.

Add a focused test using Markdown table output and/or a small HAST plugin fixture to assert serialized output contains exactly:

```html
cellpadding="0"
cellspacing="0"
valign="top"
bgcolor="..."
```

Do not assume lower-case property keys work with `ctx.setProperty(...)`.

### 2. Add/adjust diagnostics

Update `src/diagnostics.ts` with new codes:

```ts
| "insecure-link-url"
| "relative-link-url"
| "insecure-image-url"
| "relative-image-url"
| "missing-image-alt"
```

Policy:

- `http:` link: keep href, warning `insecure-link-url`.
- relative/root path link: keep href, warning `relative-link-url`.
- `#fragment`: keep href, no warning; needed for footnotes/anchors.
- `http:` image: remove/replace with alt fallback, warning `insecure-image-url`.
- relative/root/path image: remove/replace with alt fallback, warning `relative-image-url`.
- missing/empty image alt: keep image if source is valid, set `alt=""`, warning `missing-image-alt`.

Keep `unsafe-link-url` / `unsafe-image-url` for removed dangerous/invalid protocols.

Diagnostic aggregation:

- Avoid noisy output for many repeated warnings.
- For first implementation, use `addDiagnosticOnce` for broad policy warnings where exact URL is not essential, or add a small helper that dedupes by code+message.
- Keep warning messages actionable and include one sample URL when useful.
- Strict mode should still fail when any warning exists.

### 3. Split URL policy into explicit single-decision helpers

In `src/email.ts`, replace the current two-pass URL logic (`addPropertyDiagnostics(...)` then `safeUrlValue(...)`) with one decision consumed by mutation and diagnostics.

Suggested shape:

```ts
type UrlDecision =
  | { action: "keep"; value: string; diagnostic?: Diagnostic }
  | { action: "remove"; diagnostic: Diagnostic; fallbackText?: string };

function decideLinkUrl(value: unknown): UrlDecision | undefined;
function decideImageUrl(value: unknown, alt: unknown): UrlDecision;
```

Then in `applySafeProperties(...)`:

- For links, compute once, add diagnostic if present, and set/remove href based on decision.
- For images, compute once, add diagnostic if present, and keep image or replace/remove based on decision.

Policy details:

Links keep:

- `https:` no warning
- `mailto:` no warning
- `tel:` no warning
- `#fragment` no warning
- `http:` with warning
- `/path`, `./path`, `../path` with warning

Links remove:

- empty/non-string href
- control chars
- protocol-relative `//...`
- `javascript:`
- `data:`
- `file:`
- unknown protocols

Images keep:

- `https:` only

Images remove/replace with fallback:

- empty/non-string src
- control chars
- `http:`
- relative/root/path URLs
- fragments
- protocol-relative `//...`
- `data:`
- `cid:`
- `javascript:`
- `file:`
- unknown protocols

Do not emit `cid:` until the project has a sending/attachment workflow.

### 4. Preserve image fallback text when removing images

When an image is removed because its source is not acceptable, do not silently delete all user-visible content.

Preferred behavior:

- If alt text is non-empty, replace the image node with text like `[Image: Alt text]` or just `Alt text`.
- If alt is missing/empty, remove the node and emit a warning.

Keep this simple. Suggested fallback text:

```txt
[Image: Alt text]
```

Add tests for:

- `![Logo](./logo.png)` -> no `<img>`, contains `[Image: Logo]`, warning.
- `![](./logo.png)` -> no `<img>`, missing/relative image warning.

### 5. Add image alt diagnostics and safer image attrs/styles

For valid HTTPS images:

- Set `src`.
- If alt is string and non-empty after trim, preserve it.
- If alt is missing/empty, set `alt=""` and emit `missing-image-alt` warning.
- Preserve numeric `width`/`height` attrs when safe.
- Always set `border="0"` attr. Use correct HAST property if needed.
- Add safer image style:

```css
display:block;
border:0;
outline:none;
text-decoration:none;
-ms-interpolation-mode:bicubic;
max-width:100%;
height:auto;
margin:<imageMargin>
```

Use literal style key `"-ms-interpolation-mode"`; do not rely on camelCase conversion for vendor-prefixed properties.

### 6. Add legacy wrapper attrs and Outlook table styles safely

In `renderEmailDocument(...)`:

- Escape all interpolated attribute values with `Bun.escapeHTML(...)`, even if validators also protect them.
- Add `bgcolor` attributes where colors are simple/safe:
  - outer table: background color
  - outer center cell: background color
  - inner table: container background
  - content cell: container background
- Add `align="center"` to inner table if useful.
- Add `align="left" valign="top"` to content cell.
- Add Outlook table spacing resets to layout tables:

```css
border-collapse:collapse;
mso-table-lspace:0pt;
mso-table-rspace:0pt;
```

- Do **not** blindly add `mso-line-height-rule:exactly` to unitless line heights. Either skip it in this milestone or only apply it where line-height is an absolute `px` value. Recommended: skip for now to avoid clipping risk.

### 7. Switch wrapper to fluid-hybrid width

Current inner table style is effectively fixed-width:

```css
width:600px;
max-width:600px;
```

Change to mobile-friendlier fluid-hybrid:

```html
<table width="600" style="width:100%;max-width:600px;...">
```

Rationale:

- `width="600"` attr remains useful for Outlook desktop.
- `style="width:100%;max-width:600px"` lets mobile clients fit smaller screens.

Tests should assert both:

- serialized attr: `width="600"`
- style includes: `width:100%;max-width:600px`

### 8. Add legacy attrs for Markdown tables and cells

For content `table` elements in `applySafeProperties(...)`, set HAST properties that serialize to:

```html
<table width="100%" cellspacing="0" cellpadding="0" border="0" ...>
```

Likely HAST property keys:

```ts
width
cellSpacing
cellPadding
border
```

Verify via tests.

Style:

```css
width:100%;
border-collapse:collapse;
mso-table-lspace:0pt;
mso-table-rspace:0pt;
margin:<tableMargin>
```

For `th` / `td`:

- Parse GFM alignment once from original inline style.
- Set both attr and CSS from the same parsed value:
  - `align="left|right|center"`
  - `style="...;text-align:left|right|center"`
- Set `valign="top"` via correct HAST property (`vAlign`).
- Default `align="left"` is acceptable for cells with no explicit alignment.

For `tr`, `thead`, `tbody`:

- No attrs initially.

### 9. Normalize footnote `section` to `div` if safely supported

Current `section` is allowed and styled. Old email clients are safer with `div` or table/plain output.

Preferred approach:

- Allow `div` as an internally generated element.
- In the HAST plugin, when `node.tagName === "section"`, rename to `div` if Sätteri's mutation API supports tag mutation.
- Preserve safe `id` and styles.

If tag rename is not supported:

- Do not introduce brittle global regex post-processing.
- Keep `section` temporarily, add a test documenting the limitation, and add a TODO/plan note for a custom renderer or safer transform later.

Desired output if supported:

```html
<div id="..." style="margin:...;padding:...;border-top:...;color:...;font-size:...">
```

### 10. Replace code block `overflow:auto`

Change `pre` style from:

```css
overflow:auto
```

to wrapping-oriented styles:

```css
white-space:pre-wrap;
overflow-wrap:break-word;
```

Optionally add:

```css
word-break:break-word
```

Caveat: `white-space:pre-wrap` / wrapping behavior is not perfect in older Outlook. This is still preferable to depending on horizontal scrolling in email, but do not describe it as a complete Outlook fix.

Add tests asserting:

- `overflow:auto` is gone.
- `white-space:pre-wrap` and `overflow-wrap:break-word` are present.

### 11. Strengthen theme CSS validation with a focused denylist

Keep the existing injection validation and add a denylist for modern/fragile constructs likely to fail in older clients.

Reject in all style token values:

```txt
var(
calc(
clamp(
min(
max(
fit-content
min-content
max-content
vw
vh
vmin
vmax
cqw/cqh/cqi/cqb/cqmin/cqmax
lab(
lch(
oklab(
oklch(
color(
```

Keep existing rejection of:

- empty values
- values over 200 chars
- control chars
- `;`, `{}`, `<`, `>`
- CSS comments
- `url(...)`
- `expression(...)`

Do **not** implement a huge per-token allowlist in this milestone. It risks rejecting compatible values such as `rgb(...)`, `em`, `rem`, or `%` unnecessarily. If future compatibility testing shows specific token types are problematic, add targeted validators later.

Add tests for rejected modern constructs:

- `content_padding = "calc(16px + 1vw)"`
- `background_color = "oklch(...)"`
- `h1_font_size = "clamp(...)"`
- `table_margin = "1vw"`

Ensure all defaults and example themes still pass.

### 12. Address `raw_html` config UX

Current `markdown.rawHtml` is parsed but not used; raw HTML is always escaped.

Choose the least disruptive option for this milestone:

- Keep parsing `raw_html` for now to avoid breaking configs.
- Update `mdtoemail.example.toml` and README to state clearly:

```txt
raw_html is reserved/future-facing; email-safe output currently escapes raw HTML regardless of this value.
```

Do not implement raw HTML passthrough.

Future cleanup can remove the field or repurpose it only if there is a real HTML parser/sanitizer.

### 13. Review style generation property names

Current `rawStyleAttribute(...)` converts camelCase to kebab-case. This is fine for `borderLeft` -> `border-left`, but not for leading-hyphen vendor properties.

Use literal style keys for vendor/MSO properties:

```ts
"mso-table-lspace": "0pt"
"mso-table-rspace": "0pt"
"-ms-interpolation-mode": "bicubic"
```

Do not rely on `msInterpolationMode` conversion.

### 14. Update tests

Add/adjust tests in `test/email.test.ts`:

- URL decision policy:
  - `https`, `mailto`, `tel`, fragment allowed cleanly for links.
  - `http` link kept with warning decision.
  - relative path link kept with warning decision.
  - dangerous protocols removed.
  - HTTPS image allowed.
  - HTTP image removed/warned.
  - relative image removed/warned.
  - data/cid/javascript image removed/warned.
- Wrapper includes:
  - escaped `bgcolor` attrs where applicable.
  - `valign="top"`.
  - `align="left"` on content cell.
  - `mso-table-lspace:0pt`.
  - `mso-table-rspace:0pt`.
  - fluid-hybrid width pattern.

Add/adjust tests in `test/markdown.test.ts`:

- Markdown tables include `width="100%"`, `cellspacing="0"`, `cellpadding="0"`, `border="0"`.
- Table cells include `valign="top"` and `align` attrs.
- GFM alignment sets both `align="right"` and `text-align:right` from same source.
- Code block style no longer contains `overflow:auto` and contains wrapping styles.
- Image without alt emits `missing-image-alt` and outputs `alt=""`.
- Relative/http images are replaced/removed with diagnostics and alt fallback.
- Relative/http links are preserved with diagnostics according to policy.
- Raw HTML remains escaped.
- Unsupported elements remain removed/escaped.
- Footnote output uses `div` instead of `section` if implemented; otherwise assert/document current limitation.

Add/adjust tests in `test/config.test.ts`:

- All defaults pass validation.
- Current example themes pass validation.
- Reject `var`, `calc`, `clamp`, viewport units, container-query units, and modern color functions.
- Existing injection rejection still works.

Add/adjust tests in `test/cli.test.ts`:

- Strict mode fails on new warning diagnostics.
- `--no-warnings` suppresses new diagnostics.
- New image/link warnings appear in normal mode.

### 15. Update examples and docs

Update `mdtoemail.example.toml` comments:

- Document accepted/suggested theme token values.
- Warn against modern CSS functions/viewport units.
- Document image policy:
  - use HTTPS URLs
  - always include alt text
  - local/relative/http/data/cid images are removed/warned
- Document link policy:
  - prefer absolute HTTPS links
  - `http`/relative links warn
- Clarify `raw_html` reserved/no-op behavior.

Update `README.md`:

- Add/update an "Email compatibility" section.
- Mention compatibility baseline sources.
- State that output is conservative and broadly compatible, not guaranteed universal.
- Document unsupported constructs: raw HTML passthrough, scripts/forms/media/SVG, data images, relative images, CID images.

Regenerate example HTML files if tracked examples depend on changed output.

## Files likely to change

```txt
src/email.ts
src/config.ts
src/diagnostics.ts
src/markdown.ts          # likely minimal/no changes
test/email.test.ts
test/markdown.test.ts
test/config.test.ts
test/cli.test.ts
mdtoemail.example.toml
README.md
examples/*.html          # if regenerated
examples/themes/*.toml   # only if current values violate new validators
```

## API/config/interface changes

No new CLI options required.

Behavior changes:

- Relative images no longer emit `<img>` and instead warn with fallback text when possible.
- HTTP images no longer emit `<img>` and instead warn with fallback text when possible.
- Image alt text warnings are added.
- Relative/http links are preserved but warn.
- Theme values using modern fragile CSS constructs may now be rejected.
- Generated output becomes more attribute-heavy.
- Wrapper becomes fluid-hybrid for mobile compatibility.
- Footnote wrapper may change from `<section>` to `<div>` if supported.
- Code blocks wrap instead of relying on horizontal scrolling.

Potential docs wording:

> `mdtoemail` emits conservative, table-based, inline-styled HTML intended for broad email-client compatibility. It avoids arbitrary CSS and unsafe HTML. Because email clients vary, especially older Outlook versions, you should still test important templates in your target clients.

## Backward compatibility notes

- Existing safe configs using current examples/defaults should continue to work.
- Custom configs using `calc(...)`, `clamp(...)`, `var(...)`, viewport units, container-query units, or modern color functions may start failing validation. This is intentional for old-client compatibility.
- Emails that relied on local/relative Markdown images will now output fallback text and diagnostics instead of broken image tags. Users should host images and use HTTPS URLs.
- `http:` image URLs will no longer be accepted by default. Users should migrate to HTTPS.
- `http:` and relative links can remain but should warn; users should prefer absolute HTTPS links.

## Risks, edge cases, and mitigations

### Sätteri/HAST property names may differ from raw HTML attrs

Risk: Setting `cellpadding` instead of `cellPadding` might silently fail or serialize incorrectly.

Mitigation:

- Add serialized-output tests first.
- Use HAST property names (`cellPadding`, `cellSpacing`, `vAlign`, `bgColor`) where required.

### Wrapper attr interpolation could inject attributes if unescaped

Risk: Theme color values may contain quotes before stricter validation.

Mitigation:

- Escape every interpolated wrapper attribute value with `Bun.escapeHTML(...)`.
- Do not rely solely on validators.

### Sätteri plugin tag renaming may not be supported

Risk: Normalizing `section` to `div` may not be straightforward.

Mitigation:

- Inspect Sätteri plugin API during implementation.
- Prefer in-place mutation if supported.
- If not supported, document/test as a temporary limitation.
- Avoid broad regex post-processing.

### Stricter validators may reject existing user configs

Risk: Some users may use modern CSS constructs.

Mitigation:

- Use a focused denylist rather than broad per-token allowlist.
- Document allowed/rejected patterns clearly.

### More diagnostics may make strict mode fail existing inputs

Risk: Strict mode users may see new failures for relative links/images or missing alt text.

Mitigation:

- This is expected for an email-safety hardening milestone.
- Keep diagnostics clear and actionable.

### Email-client support remains imperfect

Risk: Even conservative output can render differently across clients.

Mitigation:

- Do not claim universal support.
- Add compatibility docs and encourage target-client testing.
- Use Can I Email/Campaign Monitor as ongoing references.

### Code block wrapping is not perfect in Outlook

Risk: `white-space:pre-wrap` may not fully prevent long code lines from widening tables in old Outlook.

Mitigation:

- Prefer wrapping over scrollbars for email.
- Document as best-effort.
- Consider future pre-processing of long code text if needed.

## Claude review notes incorporated

The draft plan was reviewed with the Claude CLI. Useful feedback incorporated:

- Add serialized-output tests first because HAST property names differ from raw HTML attribute names.
- Escape wrapper attribute values unconditionally before adding `bgcolor` or other attrs.
- Replace the large per-token semantic validator plan with a focused denylist of fragile modern CSS constructs.
- Preserve image alt/fallback text when removing images instead of silently deleting user-visible content.
- Use one URL decision per node to avoid diagnostics/mutation drift.
- Add fluid-hybrid wrapper width: `width="600"` attr plus `style="width:100%;max-width:600px"`.
- Do not blindly add `mso-line-height-rule:exactly` with unitless line heights.
- Clarify table alignment should derive from the same parsed source as `text-align`.
- Address the `raw_html` no-op config UX.
- Consider diagnostic noise/deduping before adding many new warnings.

Rejected or deferred feedback:

- Adding `allow_http_images` now was not included to keep scope simple. The plan instead removes HTTP images with warning/fallback and can add config later if needed.
- A full per-token validator remains deferred because it is high-maintenance and may reject compatible CSS values unnecessarily.

## Open questions

None blocking.

Assumptions to verify during implementation:

- Sätteri's HAST plugin API can set legacy attrs via HAST property names and serialize them correctly.
- Sätteri's HAST plugin API can rename `section` to `div`; if not, defer rather than using brittle string post-processing.
- Current example theme values pass the new denylist validators.

## Suggested implementation order

1. Add serialized legacy-attribute tests / verify HAST property names.
2. Add diagnostics and single-decision URL helpers.
3. Harden image/link handling and image fallback behavior.
4. Add wrapper legacy attrs, escaping, Outlook table reset styles, and fluid-hybrid width.
5. Add content table/cell legacy attrs and alignment attrs.
6. Replace code block overflow style.
7. Attempt footnote `section` normalization.
8. Add focused CSS denylist validation.
9. Update docs/example TOML and regenerate examples if needed.
10. Run full verification.

## Verification plan

Run:

```bash
bun test
bun run typecheck
bun run build
```

Manual smoke checks:

```bash
bun run src/cli.ts examples/product-update.md -o /tmp/product-update.html
bun run src/cli.ts examples/security-notice.md -o /tmp/security-notice.html
```

Inspect output for:

- no `<script>`, `<style>`, `<input>`, raw HTML passthrough
- no `<section>` if normalization is implemented
- wrapper tables have legacy attrs and MSO reset styles
- content tables have legacy attrs
- images require HTTPS or become fallback text
- diagnostics print for risky links/images

Optional later visual checks:

- Browser preview for obvious regressions.
- Real-client tests in Gmail web/mobile, Outlook desktop Windows, Outlook.com, Apple Mail, iOS Mail, Yahoo/AOL.
