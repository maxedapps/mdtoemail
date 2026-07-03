# Plan: Review Follow-ups — Vision Alignment & Polish

## Summary

Close the gaps found in the code review between the current implementation and the
`PROJECT.md` vision, plus a few code-quality rough edges. Seven items, none critical,
grouped so the highest-value work (diagnostics with line numbers) comes first.

Scope covered:

1. Remove the dead, misleading `markdown.raw_html` config flag.
2. Add source line numbers to diagnostics (the biggest vision gap).
3. Stop rendering empty/removed-href anchors as styled dead links.
4. Add the missing vision diagnostics: wide table, footnote-support, long code line.
5. De-duplicate `config.ts` (derive the theme type; extract the shared email-layout parser).
6. Decouple the footnote styling from the generic `div` element.
7. Add `--pretty` output formatting (CLI flag + `[email].pretty`).

Out of scope (unchanged): sending, tracking, servers, image hosting, Phase 6 email
components (`::button`/`:::callout` directives), a full custom HAST renderer, and any
new runtime dependency.

## Confirmed requirements and constraints

- TypeScript + Bun; keep pinned `satteri@0.9.4`; no new dependencies.
- Keep it simple and incremental per `AGENTS.md` — avoid new abstractions/layers.
- CLI only: Markdown in, conservative email HTML out. Inline styles, table layout.
- All changes must keep `bun test`, `bun run typecheck`, and `bun run build` green.
- Behavior changes to diagnostics are expected and acceptable; update tests to match.

## Verified research findings (done during planning)

These were confirmed empirically against the installed `satteri@0.9.4`, not assumed:

- **HAST nodes carry source positions.** Element nodes and `raw` nodes both expose
  `node.position.start.line` (probe: link at line 3, image at line 5, raw HTML at
  line 7 — all correct). This makes line-numbered diagnostics feasible by reading
  `node.position?.start?.line` inside the existing `visit`/`raw` handlers. No use of
  Sätteri's native `ctx.report()` is required.
- **`markdownToHtml` is dangerous-by-default.** There is no `raw_html`/`allowDangerousHtml`
  feature flag in Sätteri; raw HTML always reaches the tree. The plugin's `raw()` handler
  is the *only* thing neutralizing it. This confirms item 1 below (the config field is
  genuinely inert) and means the `raw()` escape must never regress.
- **`ctx` element mutation API** includes `removeNode`, `replaceNode`, `setProperty`,
  `insertBefore`, `insertAfter`, plus child ops. `setProperty(node, key, undefined)`
  removes a property. Freshly created replacement nodes are **not** re-walked (relevant
  to item 6 — the replacement `div` keeps whatever style we set at creation time).
- Project config tables (`[markdown]`, `[email]`) do **not** reject unknown keys, so
  removing `raw_html` parsing (item 1) will silently ignore any lingering `raw_html = ...`
  in existing configs rather than erroring — no breakage.

## Item 1 — Remove the dead `raw_html` config flag

**Problem.** `config.markdown.rawHtml` is parsed and validated in `src/config.ts`, typed
in the `Config` interface, defaulted in `defaultConfig`, but never read: `markdownFeatures()`
(`src/markdown.ts`) passes only `gfm`/`frontmatter`, and the `raw()` handler escapes
unconditionally. It advertises a capability that does not exist and is a latent footgun if
a future edit wires it to Sätteri without preserving the escape handler.

**Decision.** Remove it entirely (not "hard-fail on `true`"). It fails safe today, removal
is non-breaking (unknown keys are ignored), and deleting dead surface beats keeping a
decorative field. Keep the `raw()` escaping behavior exactly as-is; add a test asserting
raw HTML is always escaped so the safety guarantee is pinned even though the flag is gone.

**Implementation.**
- `src/config.ts`: drop `rawHtml` from the `Config["markdown"]` interface, from
  `defaultConfig.markdown`, and delete the `setBoolean(raw.markdown, "raw_html", ...)` call.
- `src/markdown.ts`: no functional change (already ignores it).
- `mdtoemail.example.toml`: remove the `raw_html` line and its comment.
- `README.md`: remove the `raw_html` bullet under "Markdown options" and the reserved-flag
  note; keep the "raw HTML is always escaped" statement in the security section.

**Tests.**
- `test/config.test.ts`: remove `raw_html` from the "maps a full TOML override" fixture and
  its expected object. Add a case: a config with `raw_html = true` loads without error and
  produces no `rawHtml` key.
- `test/markdown.test.ts`: keep/there is already a test that raw HTML is escaped; retain it
  as the standing guard (drop the `withMarkdownConfig({ rawHtml: ... })` usages).

**Risk.** Low. Only touches an unused field.

## Item 2 — Line numbers in diagnostics (primary vision alignment)

**Problem.** `PROJECT.md` frames diagnostics as the core differentiator and every example
carries a location ("at line 12"). Today `Diagnostic` has no position; with three unsafe
links you get generic, deduped messages and no way to locate them.

**Decision.** Add an optional `line?: number` to `Diagnostic`, populate it from
`node.position?.start?.line` at each diagnostic site, and render it in `formatDiagnostic`.
Shift the per-URL diagnostics from dedupe-by-code to **one diagnostic per occurrence with a
line number** (that is the whole point). Keep the broad, location-agnostic diagnostics
(`raw-html-escaped`, `task-list-input-transformed`) deduped to once, but stamp them with the
first occurrence's line.

**Implementation.**
- `src/diagnostics.ts`:
  - Add `line?: number` to the `Diagnostic` interface.
  - `formatDiagnostic`: append ` (line N)` when `line` is present, e.g.
    `Warning [unsafe-link-url]: Removed unsafe link URL "javascript:…". (line 3)`.
  - `addDiagnosticOnce`: keep dedupe-by-code for the broad codes.
  - Add a plain per-occurrence path (existing `addDiagnostic`) for URL codes.
- `src/email.ts`:
  - Thread the visited node's line into the diagnostic builders. Simplest: compute
    `const line = node.position?.start?.line` at the top of `visit` and in `raw`, and pass
    it into the `UrlDecision` diagnostics and the element diagnostics.
  - `UrlDecision.diagnostic` objects get `line` set from the owning node.
  - In `addDecisionDiagnostic`, stop routing `insecure-link-url` / `relative-link-url` /
    `insecure-image-url` / `relative-image-url` through `addDiagnosticOnce`; emit them
    per-occurrence with their line. Keep `missing-image-alt` deduped-once (it is advisory
    and would be noisy), but stamp the first line.
  - `unsupported-element` and `unsafe-*` become per-occurrence with line (already per-node).

**Design notes / decisions.**
- Ordering: diagnostics are pushed in tree-walk order, which is source order, so lines will
  read top-to-bottom naturally. No sort needed.
- `missing-image-alt` stays deduped to avoid one info line per image in image-heavy mail.
  If per-image locations are wanted later, flip it to per-occurrence — cheap change.

**Tests (expect broad churn in `test/markdown.test.ts` and `test/cli.test.ts`).**
- Update every `expect(rendered.diagnostics).toEqual([...])` to include `line`.
- New: a document with two unsafe links on different lines yields two `unsafe-link-url`
  diagnostics with distinct `line` values (proves de-dedupe).
- `test/diagnostics.test.ts`: `formatDiagnostic` renders ` (line N)` when present and omits
  it when absent.

**Risk.** Medium only in test-update volume, not logic. The data is confirmed available.

## Item 3 — Do not render empty/removed-href anchors as styled links

**Problem.** `[empty]()` and links whose URL is rejected keep the `<a>` element and still
receive link styling (`color:#2563eb;text-decoration:underline`), so they look clickable but
do nothing. `applySafeProperties` computes the URL decision but unconditionally applies the
`a` style afterward.

**Decision.** When a link URL is not kept, render the anchor content as plain inline text:
drop the link styling and emit no `href`. This is the reliable, API-risk-free baseline — a
bare unstyled `<a>text</a>` inherits body text color and reads as normal text in all clients.
(Optional nicer enhancement, only if `ctx` child-move ops prove reliable: unwrap the `<a>`
by moving its children up via `insertBefore` then `removeNode`. Not required for the fix;
skip unless trivial.)

**Implementation.**
- `src/email.ts`, `applySafeProperties`: track link outcome, e.g.
  `let linkKept = true;` set to `false` when the `a` decision is not `keep` (including the
  empty-href case). When computing the final `styleForElement("a", …)`, skip it (return no
  style) if `!linkKept`. Since a hrefless anchor is now unstyled, it renders as plain text.
- Keep emitting the existing diagnostic. Reword the empty-href case: currently an empty href
  produces `unsafe-link-url` with `""`. Add a dedicated, clearer message
  `Removed empty link URL; rendered link text as plain text.` under the existing
  `unsafe-link-url` code (no new code needed) — or keep the code and improve the message.

**Tests.**
- `test/markdown.test.ts`: `[empty]()` → output contains `>empty<` with no
  `text-decoration:underline` on that anchor and no `href=`.
- Existing "removes unsafe link URLs while preserving link text" test: assert the surviving
  anchor is unstyled (no link color) in addition to no `javascript:`.

**Risk.** Low.

## Item 4 — Add the missing vision diagnostics

Three diagnostics from `PROJECT.md` that are not implemented. All are additive.

**4a. Wide table.**
- Detect column count when visiting a `table`: count `th`/`td` cells in the first row
  (`thead > tr`, else first `tbody > tr`). Walk `node.children` — no extra Sätteri calls.
- New code `wide-table`, **severity `info`** (decision: a wide table is a readability caution,
  not an email-safety failure; making it a `warning` would fail `--strict` CI on legitimate
  wide tables). Threshold: **> 6 columns**. Message mirrors the vision:
  `Table has N columns; it may be hard to read on narrow mobile screens.` with the table's
  line. Emit once per table.
- If elevating to `warning` is later desired, it is a one-line severity change.

**4b. Footnote support.**
- We already special-case the footnotes `<section>` in `replaceSectionWithDiv`. Emit an
  `info` diagnostic there, deduped once: `footnote-support` —
  `Footnotes may render inconsistently across some email clients.` Use the section node's line.
- Gate it to actual footnote sections (see item 6's detection), not arbitrary sections.

**4c. Long code line.**
- When visiting `pre`/`code` block content, check the text length of the longest line.
  New code `long-code-line`, **severity `info`**, deduped once. Threshold: any line
  **> 80 chars**. Message:
  `Code block has long lines (max N chars); they may wrap awkwardly in some clients.`
  Note in the message/README that output already uses `white-space:pre-wrap` +
  `overflow-wrap:break-word`, so this is advisory, not a defect.
- Implementation: in the `pre` branch, read the block's text (`code` child's text nodes) and
  measure line lengths. Keep it to the `pre` visit to avoid flagging short inline code.

**Shared work.**
- `src/diagnostics.ts`: add `wide-table`, `footnote-support`, `long-code-line` to
  `DiagnosticCode`.
- All three are `info`, so `--strict` behavior is unchanged (strict fails only on warnings).

**Tests.**
- `test/markdown.test.ts`: a 7-column table emits `wide-table` (info) with a line; a
  6-column table does not. A footnote document emits `footnote-support` (info). A fenced code
  block with a >80-char line emits `long-code-line` (info); a short one does not.
- `test/cli.test.ts`: confirm `--strict` still succeeds when only these info diagnostics
  are present.

**Risk.** Low. All additive, all info-severity.

## Item 5 — De-duplicate `config.ts`

**Problem.** `Config["theme"]` hand-lists 48 `string` fields that already exist in the
`themeStringFields` table (double maintenance). `mergeConfig` and `mergeThemeConfig` also
duplicate the `email.container_width` / `email.outer_padding` parsing.

**Decision (kept deliberately small — do not merge the two merge functions).**
- Derive the theme type instead of hand-listing it: reorder so `themeStringFields` and
  `type ThemeConfigKey` are defined first, then
  `interface Config { …; theme: Record<ThemeConfigKey, string> }`. Deletes 48 duplicated
  lines with zero behavior change.
- Extract one small shared helper `applyEmailLayoutFields(rawEmail, config, prefix)` that
  handles `container_width` + `outer_padding`, called by both `mergeConfig` (prefix
  `"Invalid config"`) and `mergeThemeConfig` (prefix `"Invalid theme"`). `applyThemeFields`
  is already shared.
- **Do not** unify `mergeConfig`/`mergeThemeConfig`: their key policies genuinely differ
  (project config ignores unknown keys and allows `[markdown]`, `warnings`, `strict`,
  `theme.extends`; theme files reject all of those). Merging them would require mode flags —
  net-worse per `AGENTS.md`. Leave them as two readable functions sharing the two helpers.

**Implementation.**
- `src/config.ts`: reorder declarations; change the interface's `theme` to the mapped type;
  add `applyEmailLayoutFields`; replace the two inline `setNumber`/`setStyleString` email
  blocks with calls to it.

**Tests.** No test changes expected — behavior is identical. `test/config.test.ts`'s full
override and partial override cases already pin the mapping; they must stay green.

**Risk.** Low. Pure refactor guarded by existing exhaustive config tests + typecheck.

## Item 6 — Decouple footnote styling from generic `div`

**Problem.** `styleForElement("div")` always returns footnote chrome (top border, muted
color, small font). Any `<div>` Sätteri emits would inherit footnote styling. The coupling
is implicit and fragile.

**Decision.** Make footnote styling explicit at the one place footnotes are produced, and
make the generic `div` neutral.
- `replaceSectionWithDiv` already builds the replacement `div` (and, per the verified API,
  that node is not re-walked, so its style is fixed at creation). Detect footnotes there via
  `class="footnotes"` / `data-footnotes` on the original `section`; apply the footnote style
  **only** for footnote sections, otherwise emit a neutral `div` (no style). This is also the
  hook for item 4b's `footnote-support` diagnostic.
- Remove the `case "div":` footnote styling from the generic `styleForElement` switch (return
  `undefined` / fall through) so a stray Sätteri `<div>` passes through unstyled rather than
  masquerading as a footnote block. Keep `div` in `allowedElements`.
- Add a one-line comment on `replaceSectionWithDiv` documenting that footnote sections are
  the only styled-div source.

**Implementation.**
- `src/email.ts`: move the footnote style literal into `replaceSectionWithDiv` (guarded by
  footnote detection); drop the `div` branch from `styleForElement`.

**Tests.**
- `test/markdown.test.ts`: footnote document still renders the `<div>` with the footnote
  style (existing assertion stays green). Add: a non-footnote path does not produce
  footnote-styled divs (covered implicitly, but assert the footnote style only appears with
  footnotes present).

**Risk.** Low. The only div source in practice is footnotes; detection preserves current
output for that case.

## Item 7 — `--pretty` output formatting

**Problem.** `--pretty` is in the vision but unimplemented; output indentation is
inconsistent (escaped raw HTML lands flush-left as a naked text node, content is not indented
under the wrapper cell). A full HTML pretty-printer needs a dependency, which is disallowed.

**Decision (scoped tight, lowest priority).** Add a boolean `pretty`
(`[email].pretty`, default `false`, plus a `--pretty` CLI flag). Do **not** re-parse/re-serialize
HTML. Implement it as deterministic, line-based indentation of the already-rendered content
block within the wrapper:
- `pretty = true`: indent every line of `contentHtml` to sit under the content `<td>`, and
  ensure a trailing newline. Purely presentational; makes the common case tidy including the
  flush-left escaped-raw-HTML line.
- `pretty = false` (default): keep current compact behavior.
Document the limitation: it is line-indentation, not a structural formatter, so deeply nested
Sätteri output is not re-indented. This satisfies the vision's `--pretty` intent without a
dependency and without risking malformed HTML.

**Implementation.**
- `src/config.ts`: add `email.pretty: boolean` (default `false`); parse `[email].pretty`
  via `setBoolean` in `mergeConfig`. Reject it in theme files (add to the theme
  disallow set — themes may not set `pretty`).
- `src/cli.ts`: add `pretty: { type: "boolean" }` to `cliOptions`, help text, and
  `applyCliOverrides` (`pretty: values.pretty ? true : config.email.pretty`).
- `src/email.ts`, `renderEmailDocument`: when `config.email.pretty`, indent `contentHtml`
  lines by the content-cell indent (16 spaces) before interpolation; otherwise current path.
- `README.md`: document `--pretty` and `[email].pretty` with the stated limitation.

**Tests.**
- `test/email.test.ts`: `pretty: true` indents content lines; `pretty: false` matches current
  output.
- `test/cli.test.ts`: `--pretty` produces indented output and exits 0.

**Risk.** Low. Presentational only; both modes must round-trip through `bun test`.

## Files that will change

```txt
src/diagnostics.ts    # line field, formatDiagnostic, 3 new codes
src/email.ts          # line stamping, empty-anchor fix, wide-table/long-code/footnote
                      #   diagnostics, footnote/div decoupling, pretty indentation
src/config.ts         # remove raw_html, derive theme type, shared email-layout helper,
                      #   add email.pretty (+ theme-file rejection)
src/markdown.ts       # minimal (raw_html removal is a no-op here)
src/cli.ts            # --pretty flag, help text, override wiring
test/diagnostics.test.ts
test/markdown.test.ts # largest churn: line numbers on diagnostics + new codes
test/config.test.ts   # raw_html removal, pretty
test/email.test.ts    # empty-anchor, pretty
test/cli.test.ts      # line numbers in stderr, pretty, strict-with-info
mdtoemail.example.toml # drop raw_html, add pretty
README.md             # markdown options, diagnostics, pretty, footnote/table notes
examples/*.html       # regenerate if tracked output changes (diagnostics don't affect HTML;
                      #   pretty/default output unchanged, so likely no regen needed)
```

## Suggested implementation order

1. **Item 1** (remove `raw_html`) — smallest, unblocks clean config edits.
2. **Item 5** (config refactor) — pure refactor while config is fresh in mind; keeps later
   diffs small.
3. **Item 2** (line numbers) — the core change; touches `diagnostics.ts` + `email.ts` and
   drives most test updates. Do the test churn once, here.
4. **Item 3** (empty-anchor) and **Item 6** (div/footnote decoupling) — both localized to
   `email.ts`, land together.
5. **Item 4** (new diagnostics) — additive, builds on items 2/6.
6. **Item 7** (`--pretty`) — last, lowest value, isolated.

## Verification plan

After each item and at the end:

```bash
bun test
bun run typecheck
bun run build
```

Manual smoke checks:

```bash
bun run src/cli.ts examples/product-update.md -o /tmp/pu.html          # default
bun run src/cli.ts examples/product-update.md --pretty -o /tmp/pu2.html # pretty
```

Inspect that: diagnostics print with `(line N)`; two unsafe links on different lines produce
two located warnings; `[empty]()` renders as plain text (no link styling); a 7-column table
and a footnote block and a long code line each emit an info diagnostic; `--strict` still
passes on info-only input; `--pretty` output is indented and still valid; no `raw_html`
anywhere; raw HTML remains escaped.

## Non-goals / explicitly deferred

- Phase 6 email components (`::button`, `:::callout` directives) — separate milestone.
- Full structural HTML pretty-printing — would need a dependency; not worth it.
- Per-image `missing-image-alt` locations — kept deduped-once for noise control; trivially
  flippable later.
- Custom HAST-to-email renderer (the `PROJECT.md` "long-term" option) — current plugin
  approach remains sufficient for all items here.

## Open questions

None blocking. One thing to confirm during implementation (not a blocker): the exact
class/attribute Sätteri puts on the footnotes `section` (`class="footnotes"` vs
`data-footnotes`) — inspect at runtime and match both, defaulting to "treat as footnotes"
only when one is present.
