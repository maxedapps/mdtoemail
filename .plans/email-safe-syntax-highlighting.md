# Email-safe syntax and line highlighting

> **Status:** Ready for opt-in implementation; broad-compatibility release blocked until the client matrix in Phase 4 passes
> **Planning memory:** `.progress/email-syntax-highlighting-plan.md`

## Outcome and approach

Add opt-in syntax highlighting, per-block line highlighting, and optional line numbers for fenced Markdown code blocks. Use Shiki only as a tokenizer through fine-grained, exact-pinned packages; keep `mdtoemail` responsible for a fixed compatibility profile rendered as structural presentation-table rows, controlled text/spans, legacy attributes, and inline styles. Unsupported languages or highlighter failures retain the current plain email-safe code block instead of losing content.

The implementation must preserve existing raw-HTML escaping, URL/style policies, and plain inline-code rendering. It must not add CSS classes as a rendering dependency, CSS variables, `<style>`/`<script>`, browser-only frames, copy buttons, horizontal scrolling, or arbitrary theme/grammar loading. “Broadly compatible” may be claimed only for warning-free strict output after parser validation and the Phase 4 post-ESP client matrix; until then the feature remains opt-in and compatibility is unverified.

## Sources and traceability

| Reference | Required use |
|---|---|
| `.progress/email-syntax-highlighting-plan.md` | Use the local/Sätteri probes, dependency comparison, file inventory, and tokenizer evidence. |
| `.progress/email-html-compatibility-review.md` | Apply the extracted Can I Email support data and focused compatibility review; do not rely on unsupported whitespace/wrapping CSS as a baseline. |
| `.progress/syntax-highlighting-options.md` | Preserve the tokenizer-versus-renderer boundary and reasons not to use Expressive Code output as-is. |
| `PROJECT.md` — “MVP Markdown Support” and “Email HTML Strategy” | Preserve fenced-code support, inline styles, conservative HTML, and the no-JavaScript/no-external-CSS contract. |
| `.plans/email-compatibility-hardening.md` — code-block wrapping sections | Preserve the no-horizontal-scroll decision and current plain fallback, while superseding CSS wrapping as the highlighted compatibility baseline. |
| `.reviews/production-readiness-review.md` — final-size finding | Address the confirmed gap where strict mode accepts HTML above Gmail's clipping threshold; highlighting increases that risk. |
| `src/markdown.ts` — `renderMarkdown` | Append the trusted highlighting plugin after sanitization without changing frontmatter or feature behavior. |
| `src/email.ts` — `emailHastPlugin`, `applySafeProperties`, `styleForElement`, `longestCodeLine` | Keep the current plain fallback, sanitization, style ownership, and long-line diagnostics. |
| `src/config.ts` — `Config`, `themeStringFields`, `mergeConfig`, `mergeThemeConfig` | Extend the existing TOML/default/theme merge contract with explicit validation. |
| `test/markdown.test.ts` — code-block and long-line cases | Preserve existing wrapping and diagnostic behavior while adding highlighted-output regressions. |
| [Shiki shorthands/token APIs](https://shiki.style/guide/shorthands) | Use token output rather than Shiki-generated HTML. |
| [Shiki regex engines](https://shiki.style/guide/regex-engines) | Use the JavaScript engine without forgiving mode; fall back visibly on errors. |
| [Shiki performance guidance](https://shiki.style/guide/best-performance) | Use fine-grained imports and a lazily created, cached highlighter. |
| [Mailchimp Gmail clipping guidance](https://mailchimp.com/help/gmail-is-clipping-my-email/) | Use a conservative pre-ESP budget below Gmail's documented 102 KB clipping point. |
| [Can I Email source data](https://github.com/hteumeuleu/caniemail/tree/main/_features) | Treat tables/background/font properties as the baseline and `white-space`, `overflow-wrap`, `word-wrap`, `word-break`, `table-layout`, and `<wbr>` as progressive or unsupported in classic Outlook/Gmail. |
| [Sätteri Expressive Code](https://satteri.bruits.org/docs/expressive-code/) | Avoid its injected CSS/variables/JavaScript and complex web renderer. |

## Decisions and constraints

| Decision | Why | Status / consequence |
|---|---|---|
| Use Shiki 4.3.1 token APIs through `@shikijs/*` fine-grained packages. | Accurate grammar tokenization has substantial value; empirical Bun builds were ~0.9 MB for seven selected grammars versus ~9–10 MB for full/registry imports. | Confirmed; exact-pin all four package versions and do not import `shiki` or bundled registries. |
| Use `createJavaScriptRegexEngine()` with strict/default error behavior. | Avoids WASM/native packaging and works on Bun 1.3.14; errors must not silently produce inaccurate highlighting. | Confirmed; catch failures at the block boundary, warn, and preserve plain code. |
| Keep highlighting opt-in with `[markdown].syntax_highlighting = true`. | Existing output remains unchanged until the compatibility matrix qualifies the new renderer. | Confirmed compatibility-first default; do not flip it in this plan. |
| Bundle Bash (`bash`, `sh`, `shell`, `shellscript`), CSS (`css`), diff (`diff`), HTML (`html`), JavaScript (`js`, `javascript`), JSON (`json`), JSX (`jsx`), Markdown (`md`, `markdown`), Python (`py`, `python`), SQL (`sql`), TOML (`toml`), TSX (`tsx`), TypeScript (`ts`, `typescript`), and YAML (`yaml`, `yml`). | Covers common newsletter/tutorial use while keeping build size and support explicit. | Confirmed MVP boundary; every canonical grammar and alias must be tested. |
| Support ` ```lang {2,4-6} lineNumbers ` metadata through `parseCodeMeta(meta, lineCount)`. | One-based ranges are compact; passing line count enables bounded validation before expansion. | Confirmed; unrelated metadata is ignored and malformed leading highlight syntax warns. |
| Treat palette and code surface as one fixed compatibility profile: GitHub-light tokens, `#f6f8fa` background, `#24292e` foreground, `#fff8c5` highlight, `#6e7781` numbers, `Courier New, Courier, monospace`, `14px/20px`. | Prevents valid theme config from pairing light tokens with dark/invalid surfaces and gives Outlook explicit typography. | Confirmed; highlighted blocks ignore customizable plain-code theme tokens in MVP. |
| Run the existing sanitizer first and a trusted code renderer second. | Existing HAST must be sanitized and diagnosed before replacement; the final renderer can emit controlled token spans without widening the general allowlist. | Confirmed security boundary; generated content must be typed HAST/text only. |
| Use one presentation-table row per source line and `<code>`/token spans directly in the cell; do not rely on `<pre>`, `white-space`, `overflow-wrap`, `word-wrap`, `word-break`, `<wbr>`, or `table-layout` for correctness. | Can I Email data shows those CSS/HTML wrapping mechanisms fail in classic Outlook or major web/mobile clients. | Confirmed baseline; line rows and encoded visual whitespace are structural, while CSS wrapping remains optional enhancement only. |
| Expand tabs to four-column stops and encode leading/repeated spaces with controlled NBSP patterns after token-integrity validation. | Preserves visible indentation when clients collapse whitespace. | Confirmed visual-fidelity trade-off; copied text may contain NBSP/expanded tabs and must be documented. |
| Reject compatibility-risky highlighted blocks at 20,000 UTF-16 code units, 200 lines, 8,000 tokens, or any line above 80 conservative display columns. | Email snippets should be bounded; CSS cannot safely wrap long identifiers in classic Outlook. | Confirmed warnings; warning-free strict conversion is required for compatibility qualification. No automatic hard wrapping. |
| Warn at 85 KiB pre-ESP final UTF-8 HTML and make post-ESP source size a release gate. | Leaves headroom below Gmail's approximate 102 KB clipping point for provider rewrites/tracking. | Confirmed; compatibility evidence requires strict no-write at the budget and delivered-source measurement. |
| Parse every generated fixture with `parse5` and assert the exact table tree. | Typed HAST and substring tests do not prove valid nesting, absence of foster parenting, or parse-error-free output. | Confirmed structural-validity gate; intentional obsolete email attributes are allowed and documented. |
| Add an npm `files` allowlist. | The current package includes plans/tests/internal artifacts; new dependencies make packed-artifact verification part of delivery. | Confirmed release requirement. |
| Make a named post-ESP client matrix release-blocking. | Browser preview cannot test classic Outlook Word rendering, Gmail sanitization, provider mutation, or mobile clients. | Confirmed; implementation may land opt-in, but broad-compatibility release/claim remains blocked until Phase 4 passes. |
| Keep line numbers explicit per block and visual-only. | `aria-hidden` affects accessibility, not clipboard selection. | Confirmed; exact copy fidelity with line numbers is not guaranteed and must be documented/tested. |
| Defer code titles, copy buttons, editor chrome, automatic language detection, user-supplied palettes/grammars, dynamic themes, conditional Outlook branches, and automatic hard wrapping. | They add duplicated/browser-oriented markup, clipping risk, copy changes, or unsafe loading/configuration surfaces. | Explicitly out of scope. |

## Phase 1 — Establish the tokenizer, metadata, and configuration contracts

**Files and references**

- Modify `package.json` and `bun.lock`: add the exact-pinned fine-grained Shiki packages and an explicit publish allowlist.
- Create `src/highlight.ts`: own language aliases, lazy highlighter initialization, token normalization, and code-fence metadata parsing.
- Create `test/highlight.test.ts`: protect metadata parsing, aliases, token output, fallback inputs, and singleton behavior where observable without test-only production APIs.
- Modify `src/config.ts` — `Config`, defaults, project/theme merging, and validation.
- Modify `test/config.test.ts`: cover complete/partial config mapping and invalid values.
- Modify `mdtoemail.example.toml`: expose the supported defaults and comments.

**Implementation**

1. Add these exact runtime dependencies and regenerate `bun.lock` with Bun:
   - `@shikijs/core@4.3.1`
   - `@shikijs/engine-javascript@4.3.1`
   - `@shikijs/langs@4.3.1`
   - `@shikijs/themes@4.3.1`
   Add `parse5@8.0.1` as an exact dev dependency for HTML5 parse/tree validation.
2. Add `files: ["src", "examples", "README.md", "LICENSE", "mdtoemail.example.toml"]` to `package.json`; npm includes `package.json` automatically. This intentionally excludes `.plans`, `.progress`, `.reviews`, tests, `PROJECT.md`, and agent instructions while retaining every path referenced by the user README.
3. In `src/highlight.ts`, import only the selected language modules, `github-light`, `createHighlighterCore`, and `createJavaScriptRegexEngine`. Do not import `shiki`, registry modules, or full/web bundles.
4. Build the exact, case-insensitive alias map listed in Decisions. Treat `text`, `txt`, and `plaintext` as intentional plain code without an unsupported-language diagnostic.
5. Lazily initialize one cached highlighter promise only after a supported language is requested. Reuse it for every block; use strict JavaScript-engine conversion, not `forgiving: true`.
6. Normalize Shiki output into project-owned token data containing only text, an optional validated six-digit hex color, and boolean bold/italic/underline flags. Invalid/missing colors become `undefined`; the renderer owns the fixed compatibility-profile foreground fallback. Never expose or render `htmlStyle`, classes, or arbitrary Shiki HAST/HTML.
7. Implement `parseCodeMeta(meta, lineCount)` with this exact grammar: after leading/trailing metadata whitespace is trimmed, an optional highlight expression must be the first token and match `{N[,N|N-M]*}`, with no internal whitespace. `N` and `M` are base-10 positive safe integers. An exact whitespace-delimited `lineNumbers` token may appear in the remaining metadata; unrelated tokens are ignored.
8. Before constructing a set or iterating a range, require at most 500 comma-separated segments and validate every endpoint as safe, `>= 1`, `<= lineCount`, and `start <= end`. Duplicate/overlapping valid ranges deduplicate. Unmatched braces, empty segments, zero/negative/open/reversed/non-numeric/unsafe/out-of-range references make the entire highlight expression invalid; retain `lineNumbers` but discard all highlights.
9. Extend config only with `markdown.syntaxHighlighting`, defaulting to `false`. Theme files cannot enable it, and existing plain/inline code theme tokens remain unchanged. The highlighted compatibility profile is deliberately fixed and not user-configurable in MVP.
10. Add pure/testable limits: 20,000 UTF-16 code units, 200 logical lines, 8,000 produced tokens, and 80 conservative display columns per line. Define display columns as tab stops of four, ASCII code points as one, and non-ASCII code points as two; validate before range/set/render expansion where applicable.
11. Add a pure streaming display-whitespace transformer after token integrity is proven: expand each tab to the next four-column stop; convert every leading or trailing space to NBSP; leave a single internal space normal; for an internal run of two or more spaces, emit NBSP for the first `n-1` and one final normal space to retain a possible wrap point. Handle runs across token boundaries while preserving each character's token style, then merge adjacent equal-style segments. Keep source token text unchanged before this display-only step.
12. Keep the current uncommitted concise `README.md` rewrite intact; documentation changes belong to Phase 3 and must be targeted rather than replacing the file from an older revision.

**Contract or shape**

```ts
type ThemeConfig = Record<ThemeConfigKey, string>;

interface Config {
  markdown: {
    gfm: boolean;
    frontmatter: boolean;
    syntaxHighlighting: boolean;
  };
  email: { /* unchanged */ };
  theme: ThemeConfig;
}

interface ParsedCodeMeta {
  highlightedLines: ReadonlySet<number>;
  lineNumbers: boolean;
  invalidHighlight?: string;
}

function parseCodeMeta(meta: string | undefined, lineCount: number): ParsedCodeMeta;

interface CodeTokenizer {
  tokenize(code: string, language: SupportedCodeLanguage): Promise<HighlightedCode>;
}

interface HighlightToken {
  text: string;
  color?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

type HighlightedCode = readonly (readonly HighlightToken[])[];

const EMAIL_CODE_PROFILE = {
  background: "#f6f8fa",
  foreground: "#24292e",
  highlightBackground: "#fff8c5",
  lineNumber: "#6e7781",
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: "14px",
  lineHeight: "20px",
} as const;

function displayColumns(line: string, tabWidth: 4): number;
function toEmailDisplayTokens(tokens: readonly HighlightToken[], tabWidth: 4): readonly HighlightToken[];
```

**Pitfalls and safeguards**

- Keep Shiki types behind `src/highlight.ts`; other modules consume project-owned types so dependency upgrades do not spread.
- Do not create the highlighter at module import time. Ordinary Markdown without supported language fences must avoid grammar initialization.
- Keep the fixed compatibility palette/typography in one exported immutable constant consumed by renderer/tests; do not partially mix it with existing configurable plain-code tokens.
- The package engine metadata targets Node >=20; this project targets Bun. Keep the verified Bun 1.3 floor and add package/runtime execution checks rather than adding an irrelevant Node runtime promise.

**Checks**

- `bun test test/highlight.test.ts test/config.test.ts` — expect every canonical grammar to tokenize under `github-light`, every alias to resolve, highlighting to remain opt-in, valid ranges to deduplicate, malformed/huge/out-of-range metadata to fail, limits/display columns to be deterministic, and NBSP/tab display transformation not to alter pre-transform token integrity.
- `bun run typecheck` — expect no Shiki types to leak beyond `src/highlight.ts` and the complete config fixture to require all new defaults.
- `bun run build && wc -c dist/cli.js` — expect a successful Bun-target bundle well below the ~9 MB full-import baseline; investigate any output above 3 MB as an accidental broad import.
- Run a throwaway no-code conversion and a supported-language tokenization probe — expect identical plain Markdown behavior and successful token output without WASM files/errors.
- Confirm the checkpoint includes package/lock changes, config fixtures, defaults, and example TOML.

**Review checkpoint**

- Review package imports, lazy initialization, alias coverage, metadata grammar, config merge policy, and strict color/token normalization against official Shiki docs and the planning-memory probes.
- Evidence: dependency diff, bundle byte count, focused test output, and one tokenization probe.
- Exit when no broad Shiki bundle/registry import remains, invalid metadata is deterministic, and all focused checks rerun green.

## Phase 2 — Integrate trusted email rendering, diagnostics, and fallbacks

**Files and references**

- Modify `src/highlight.ts`: add the final HAST plugin and conservative renderer.
- Modify `src/markdown.ts` — `renderMarkdown`: run the new plugin after `emailHastPlugin`.
- Modify `src/diagnostics.ts` — `DiagnosticCode`: add code-highlighting, limit, and final-size diagnostics.
- Modify `src/cli.ts` — `main`: evaluate final HTML byte size before printing diagnostics/strict-mode enforcement.
- Modify `src/email.ts` only if a genuinely shared safe style/color helper prevents policy duplication; do not widen `allowedElements` for user-originated spans.
- Create `test/html-validity.test.ts`: parse full generated fixtures with parse5, fail on parser errors, and assert the exact highlighted table subtree/content placement.
- Modify `test/markdown.test.ts`, `test/diagnostics.test.ts`, `test/email.test.ts`, and `test/cli.test.ts`.

**Implementation**

1. Add `codeHighlightPlugin(config, diagnostics, tokenizer = defaultCodeTokenizer)` after `emailHastPlugin`. The optional project-owned `CodeTokenizer` parameter is the only test seam for deterministic tokenization failures; production callers omit it.
2. Highlight only the exact canonical shape `pre.children.length === 1`, child type `element`/tag `code`, `code.children.length === 1`, and child type `text`; require `code.data.lang` and treat `code.data.meta` as optional. Any other shape remains untouched; if it claims a language but is structurally non-canonical, emit `code-highlighting-failed` rather than discarding siblings/content.
3. Derive the tokenizer source by removing exactly the one terminal newline Sätteri adds to fenced-code HAST; retain any preceding source newline. Compute logical line count from that normalized value and pin empty/trailing-blank behavior with tests.
4. If highlighting is disabled, language is absent/plaintext, or language is unsupported, preserve the sanitizer-styled `pre > code` tree. Emit `unsupported-code-language` info per unsupported block with source line; emit nothing for absent/plain language.
5. Before initializing Shiki, compare source against the 20,000-code-unit, 200-line, and 80-display-column limits. If code units/lines exceed limits, emit `code-highlighting-skipped`; if a line exceeds 80 columns, preserve plain code and rely on the now-warning `long-code-line` diagnostic. Do not include source text in diagnostics. Warning-free strict output is the compatibility contract.
6. Parse metadata with `parseCodeMeta(meta, lineCount)`. Emit `invalid-code-highlight` warning per malformed block; retain syntax colors and `lineNumbers`, but ignore every requested highlight.
7. Tokenize inside a block-level `try/catch`. On a thrown/rejected tokenizer, emit `code-highlighting-failed` with language/source line and preserve plain code. Use the injected tokenizer in plugin/integration tests only; spawned CLI strict tests use reachable invalid-metadata or limit warnings.
8. Count normalized tokens before rendering. Above 8,000, emit `code-highlighting-skipped` and preserve plain code so token spans cannot amplify output without bound.
9. Before replacement, require token-line count to equal normalized source line count and each token line's concatenated text to equal the corresponding source line; joining reconstructed lines with `\n` must equal the normalized source exactly. On mismatch, emit `code-highlighting-failed` and preserve plain code. Otherwise build typed HAST only; never concatenate HTML or consume Shiki HTML/HAST/style strings.
10. Render valid explicit HAST: outer `table > tbody > tr > td` and inner `table > tbody > tr > td` structures, each with `role="presentation"`, `width="100%"`, zero border/cell spacing/padding, and the fixed profile background via inline `background-color` plus legacy `bgcolor`. Use wrapper-cell bottom padding for block spacing; do not rely on table margins. `table-layout:fixed` may remain progressive enhancement but is not a correctness assumption.
11. Render one inner row per logical source line. Put `<code>` and controlled token spans directly in the code cell; do not use `<pre>` as a whitespace mechanism. After source/token reconstruction succeeds, transform only display text: expand tabs to four-column stops and encode leading/repeated spaces with the documented NBSP pattern. Use `<br>` for an empty line.
12. Apply fixed profile font family, `14px` font size, `20px` line height, foreground, and `mso-line-height-rule:exactly` directly to line-number/code cells and `<code>`. Keep `white-space`/wrapping properties out of the compatibility contract; they may be emitted only as harmless progressive enhancement.
13. Add optional visual line numbers in a right-aligned `width="40"`/`width:40px` cell with `align="right"`, `valign="top"`, fixed padding, and `aria-hidden="true"`. Do not claim that `aria-hidden` controls clipboard copying; document that copied numbers/NBSP/tab expansion may vary by client. Apply the fixed highlight background through cell inline color plus legacy `bgcolor`.
14. Render token spans only when their validated color differs from the fixed foreground or a font flag requires it. Permit only six-digit hex `color`, `font-weight:700`, `font-style:italic`, and `text-decoration:underline`; missing/invalid color inherits the fixed cell foreground. Keep generated spans out of the general `allowedElements` policy, and run no untrusted plugin afterward.
15. Change `long-code-line` from info to warning because major clients cannot reliably wrap long unbroken code. The sanitizer still computes it before replacement with the original source line; strict mode must block output until authors shorten the line or deliberately run non-strict outside the compatibility guarantee.
16. Add a pure/exported `addFinalHtmlSizeDiagnostic(html, diagnostics)` helper in `src/diagnostics.ts`: calculate UTF-8 bytes with `Buffer.byteLength(html, "utf8")` and append `large-email-html` at `>= 85 * 1024`. In `src/cli.ts`, render the complete document, call the helper, then print diagnostics, enforce strict mode, and only then write. Phase 4 additionally measures post-ESP delivered source.
17. Ensure strict behavior: invalid metadata, limit fallback, over-width lines, highlighter failure, or over-budget final HTML prevents output; unsupported language remains info-only and writes the content-equivalent plain fallback outside the highlighted compatibility profile.
18. In `test/html-validity.test.ts`, parse default/highlighted/numbered/empty-line/malicious-code full documents with parse5 `onParseError`; expect zero parser errors. Traverse the parsed tree to assert explicit table/tbody/tr/td nesting, one source line per row, code text remaining under its intended cell, no foster-parented siblings, and only the controlled generated element/attribute set. Obsolete email attributes are intentional and not parse errors.

**Contract or shape**

````md
```ts {2,4-6} lineNumbers
const user = await loadUser();
if (!user) return;

const name = user.name;
sendEmail(user.email);
log(name);
```
````

```html
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f6f8fa" style="width:100%;background-color:#f6f8fa">
  <tbody><tr><td style="padding:12px 12px 16px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tbody><tr>
        <td aria-hidden="true" align="right" valign="top" width="40" style="width:40px;padding-right:8px;font-family:'Courier New',Courier,monospace;font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:#6e7781">2</td>
        <td valign="top" bgcolor="#fff8c5" style="font-family:'Courier New',Courier,monospace;font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:#24292e;background-color:#fff8c5"><code style="font-family:'Courier New',Courier,monospace;font-size:14px;line-height:20px"><span style="color:#d73a49">if</span>&nbsp;...</code></td>
      </tr></tbody>
    </table>
  </td></tr></tbody>
</table>
```

The exact attribute serialization may follow Sätteri conventions, but the structure, trust boundary, and absence of classes/CSS/JS are invariant.

**Pitfalls and safeguards**

- Do not run highlighting before sanitization: generated spans would either be stripped or tempt widening the user-content allowlist.
- Do not mutate `pre` and its `code` descendant in one plugin pass. Separate plugins avoid stranded transforms against a replaced subtree.
- Do not use `codeToHtml`, `token.htmlStyle`, Expressive Code output, or user-controlled style/property names.
- Keep language/meta strings out of style attributes and element names. Use the explicit alias map and diagnostics only.
- Structural rows guarantee line breaks; the deterministic NBSP/tab display transform guarantees indentation. Do not claim exact clipboard fidelity: clients may copy NBSP, expanded tabs, or visual line numbers. Preserve and test source integrity before display transformation.
- Do not rely on `white-space`, wrapping CSS, table layout, `<wbr>`, zero-width spaces, soft hyphens, or conditional Outlook duplicates. They are unsupported/inconsistent, contaminate copy, or increase clipping/QA risk.
- Apply fixed profile colors/typography and spacing directly to cells/code. Do not inherit from custom plain-code theme values or rely on table margins.
- Evaluate size/line/column limits before lazy highlighter initialization, and range endpoints before expansion; a huge block or `{1-999999999}` must take bounded work.
- The compatibility guarantee is conditional on strict mode and the matrix. Non-strict output, custom provider mutation, and unqualified clients may degrade and must not be marketed as supported.

**Checks**

- `bun test test/highlight.test.ts test/markdown.test.ts test/diagnostics.test.ts test/email.test.ts test/html-validity.test.ts test/cli.test.ts` — expect every bundled grammar/alias, structural rows/indentation, line backgrounds/numbers, deterministic failure/mismatch, limits, parser-clean HTML, final-size warning, fallbacks, escaping, and strict behavior.
- Assert generated highlighted HTML contains presentation tables and inline token colors, but no `<style`, `<script`, `class=`, `var(`, `data-`, event attributes, or unescaped code content.
- Assert raw Markdown `<span style="color:red">` is still escaped and cannot enter the trusted renderer.
- Assert no-language, plaintext, disabled highlighting, and unsupported language retain the existing `pre-wrap` plain block; unsupported language emits info only.
- Assert an 81-column line emits warning and remains plain; assert 20,001 code units, 201 lines, 8,001 injected tokens, and `{1-999999999}` fall back/warn without unsafe expansion.
- Unit-test `addFinalHtmlSizeDiagnostic` at 87,039/87,040 UTF-8 bytes, including multibyte text; add a CLI case proving a real over-budget conversion warns and strict mode leaves no output.
- Parse full outputs with parse5 and assert zero parser errors plus the exact explicit tbody/table/row/cell tree; inspect that no token/code text is foster-parented, dropped, or interpreted as markup.
- Manually render malicious-looking code (`<script>`, quotes, ampersands, closing tags, CSS text) — expect visible escaped source and no executable/structural injection.
- Confirm the checkpoint includes renderer, plugin order, diagnostic union/format expectations, CLI strict behavior, and all fallbacks.

**Review checkpoint**

- Review `src/highlight.ts` and plugin order adversarially for sanitizer bypass, raw string construction, style injection, mutation-order bugs, copy/accessibility regressions, and content loss.
- Evidence: focused test output, representative generated HTML, malicious-code fixture output, desktop/mobile screenshots, and browser copy results for numbers on/off.
- Exit when parse5 confirms the exact explicit table tree, structural rows/NBSP patterns preserve visible line breaks/indentation in desktop/mobile browser probes without relying on wrapping CSS, and every input path produces controlled highlighted HAST or the current sanitized plain-content fallback without a security/strict-mode concern. This checkpoint does not qualify broad client compatibility; Phase 4 does.

## Phase 3 — Ship concise documentation, examples, and release evidence

**Files and references**

- Modify the current concise `README.md`: add only opt-in syntax, metadata, supported-language, fixed compatibility-profile, strict-mode, copy, fallback, and limit instructions.
- Modify `PROJECT.md`: record syntax/line highlighting as implemented conservative code-block behavior and retain deferred interactive features.
- Modify `mdtoemail.example.toml` if Phase 1 did not complete all comments.
- Create `examples/code-highlighting.md`, `examples/code-highlighting.toml`, and generated `examples/code-highlighting.html`.
- Do not regenerate existing tracked outputs because highlighting remains off by default. Verify they are byte-identical after implementation; only the new explicit opt-in example should add generated HTML.

**Implementation**

1. Add one compact README section showing opt-in `syntax_highlighting = true`, required production `strict = true`/`--strict`, a normal language fence, `{2,4-6} lineNumbers`, exact aliases, fixed palette/typography, 80-column/size limits, NBSP/tab/copy caveats, and fallback behavior.
2. Keep README short and user-actionable. Link to `mdtoemail.example.toml` rather than restating configuration; preserve the user's current uncommitted rewrite.
3. Add an example/config with `syntax_highlighting = true` and `strict = true`, containing TypeScript with highlighted lines/numbers, Python without numbers, HTML-like code that proves escaping, indentation/tabs/blank lines, non-ASCII text, and a maximum-80-column identifier. Keep over-limit/unsupported cases in tests, not the warning-free canonical output.
4. Document the fixed GitHub-light compatibility surface and that custom/dark syntax palettes are unsupported in MVP; existing plain-code theme tokens do not affect highlighted blocks.
5. Generate only the new tracked HTML through the real CLI under strict mode. It must have no warning diagnostics and remain below the 85 KiB pre-ESP budget.
6. Update project vision/docs to state that highlighting is build-time tokenization rendered as controlled inline email markup, not arbitrary HTML sanitization or browser widgets.
7. Run `npm pack --dry-run` and assert the allowlist contains only package metadata plus `src/`, `examples/`, `README.md`, `LICENSE`, and `mdtoemail.example.toml`; fail the checkpoint if `.plans`, `.progress`, `.reviews`, `test`, `PROJECT.md`, or agent instructions appear.
8. Install the tarball in a clean temporary Bun consumer and run a highlighted conversion because new runtime dependencies/subpath imports affect distribution.

**Pitfalls and safeguards**

- Do not claim compatibility with every language/client; document the exact bundled set and require target-client testing.
- Do not recommend arbitrary Shiki themes, CSS classes, or web fonts.
- Avoid generated-example drift: use the documented command and verify a second regeneration is byte-identical.
- The package allowlist is mandatory in this plan; do not downgrade leakage to a recorded caveat. Run artifact inspection from a clean archive/copy so review-created ignored files do not distort owner-authored package evidence.

**Checks**

- Run the documented README commands — expect successful strict conversion and generated highlighting matching the documented syntax.
- Regenerate `examples/code-highlighting.html` twice and compare hashes — expect byte-identical output and no tracked drift.
- `bun run build && wc -c dist/cli.js` plus `grep`/inspection — expect the bounded fine-grained bundle and no embedded full language registry/WASM asset.
- `npm pack --dry-run`, assert the exact allowed path roots/forbidden internal roots, then install the tarball in a clean temporary Bun consumer and run a highlighted conversion — expect all Shiki subpath dependencies present and the installed `mdtoemail` bin to work.
- Use agent-browser at 1280px, 375px, and 320px widths — expect readable fixed-profile colors, structural full-width highlighted rows, visible indentation/blank lines, fixed 40px number column, and no horizontal overflow for warning-free fixtures.
- Copy code containing indentation/empty lines with numbers on/off — record actual NBSP/tab-expansion/line-number behavior. Do not require or claim exact source copying; require only no content loss/reordering and document the observed trade-off.
- Confirm existing generated examples are byte-identical because highlighting defaults off.

**Review checkpoint**

- Review docs/examples/package evidence for accuracy, supported-language claims, generated-file drift, dependency availability, and overpromising email compatibility.
- Evidence: README diff, deterministic example hash, package manifest/install output, browser screenshots, and available email-client results.
- Exit when a new user can reproduce the feature from README commands and all limitations/fallbacks are explicit.

## Phase 4 — Qualify the compatibility profile through an actual ESP and client matrix

**Files and references**

- Create `docs/syntax-highlighting-compatibility.md`: record provider, exact client/app/OS versions, fixture hash, delivered-source byte size, screenshots/report links, pass/degradation/failure per case, and qualification date.
- Use `examples/code-highlighting.html` as the canonical source, then send it through the owner-selected production-like ESP/provider so link rewriting/sanitization is represented.
- Keep provider credentials, inboxes, sessions, and downloaded private message sources outside the repository.

**Implementation / operator qualification**

1. Select and record the actual ESP/provider used for qualification. Capture the pre-send HTML SHA-256/bytes and the delivered HTML source bytes after provider transformation; fail if delivered source reaches Gmail's clipping boundary or exceeds the approved 85 KiB pre-ESP budget before sending.
2. Test these release-blocking client families with exact versions recorded:
   - Classic Outlook Windows: Outlook 2016, 2019, 2021, and Microsoft 365 Classic.
   - Microsoft web engine: Outlook.com and New Outlook.
   - Gmail: current web in Chrome, Gmail iOS, and Gmail Android.
   - Apple: current macOS Mail and iOS Mail.
   Add Yahoo web and Samsung Email only if README/project positioning claims them explicitly.
3. Test normal and client dark modes where available using fixtures for: highlighting on/off; highlighted lines with numbers on/off; tabs/leading/repeated spaces; empty/trailing blank lines; 80-column and 81-column strict failure; long unbroken identifiers; HTML-like code/quotes/ampersands; non-ASCII/emoji; maximum rows/tokens/bytes; unsupported-language fallback; 320–375px mobile viewport.
4. Treat these as release-blocking failures: lost/duplicated/reordered/interpreted source; collapsed indentation/blank lines beyond the documented display transform; horizontal widening/clipping/overlap; unreadable token/background contrast; missing advertised line highlights; number/code overlap; malformed/foster-parented markup; Gmail clipping; or post-ESP size over the approved budget.
5. Allow and document only these degradations: system monospace substitution; small spacing/line-height differences; modest client-induced color shifts that retain readable contrast; loss of token bold/italic/underline when colors remain distinct; and line numbers/NBSP/tab expansion appearing in copied text.
6. If any blocking client fails, keep highlighting opt-in, mark broad compatibility unqualified, fix the single renderer path, rerun automated/parser/browser checks, and repeat the complete affected matrix. Do not introduce conditional Outlook markup without a separately reviewed plan because it duplicates content and expands clipping/QA risk.
7. Re-run qualification whenever highlighted markup structure, fixed profile colors/typography, Shiki major/minor version, Sätteri version, provider, or supported-client claim changes.

**Pitfalls and safeguards**

- Local Chromium screenshots prove neither Outlook Word rendering nor provider/Gmail sanitization.
- A warning-free parser/test suite proves structural correctness, not recipient-client rendering.
- Do not publish a “broadly compatible syntax highlighting” claim while any required client is untested or blocked. The feature may ship clearly labeled experimental/opt-in with the unqualified matrix recorded.

**Checks**

- Inspect each client against the same fixture hash and retain the completed matrix/report — expect every release-blocking condition to pass or the feature to remain unqualified.
- Compare pre-send and delivered source sizes/markup — expect no clipping budget breach, script/style injection, source loss, or provider-created invalid structure.
- Rerun parse5 structural validation against delivered HTML when the provider source can be exported safely — expect no parser errors affecting the code subtree.

**Review checkpoint**

- Independently review the completed compatibility report, screenshots, delivered-source evidence, and any accepted degradation against the matrix above.
- Exit only when every required client has current evidence and no blocking failure remains; otherwise production compatibility stays explicitly blocked.

## Final validation and review

- Run `bun test` — expect all existing and new tests to pass with no skips.
- Run `bun run typecheck` — expect strict TypeScript success.
- Run `bun run build` — expect a successful Bun bundle below the 3 MB investigation threshold and no full Shiki/WASM import.
- Run `bun audit` — expect no known vulnerabilities; assess any finding before release.
- Run parse5 full-document validation/tree assertions — expect zero parser errors and exact explicit highlighted table nesting/content placement.
- Run `git diff --check`, regenerate the new example twice, and compare existing generated examples — expect no whitespace errors, deterministic new output, and no default-off drift.
- Run the clean packed-artifact consumer test and assert the package allowlist — expect installed opt-in CLI highlighting and no internal plan/review/test artifacts.
- Complete 1280/375/320px browser QA, then complete every release-blocking Phase 4 post-ESP client case before claiming broad compatibility; an unavailable required client keeps qualification blocked rather than merely lowering confidence.
- Request an independent implementation review focused on the trusted-renderer boundary, HTML parse/tree validity, structural whitespace encoding, fixed profile contrast/typography, 80-column/85-KiB gates, Shiki bundle discipline, async plugin ordering, config compatibility, and matrix evidence. Provide this plan, tracker, diff, generated/delivered HTML, bundle/package evidence, screenshots, client versions, failures/degradations, and known constraints.
- Convert material findings into tracked work, fix them, rerun affected checks, and obtain follow-up review until no material concern remains or a human decision blocks completion.

## Definition of Done

- Syntax highlighting remains opt-in; supported fenced blocks receive deterministic colors/structural rows, while unlabelled/plain/disabled/unsupported/failed/limited blocks preserve readable content equivalent to current sanitized plain code.
- `{2,4-6}` highlighting and visual `lineNumbers` work with bounded metadata; NBSP/tab/copy trade-offs are documented without claiming exact clipboard fidelity.
- Highlighted markup uses explicit parse5-validated table/tbody/tr/td/code/span/br nesting, fixed profile colors/pixel typography, safe attributes, structural rows, controlled display whitespace, legacy fallbacks, and inline styles only; no raw HTML, class dependency, CSS variables, `<style>`, JavaScript, conditional duplicate branch, or CSS-dependent wrapping is required.
- Warning-free strict conversion enforces 80 display columns, 20,000 code units, 200 rows, 8,000 tokens, and 85 KiB pre-ESP HTML; over-limit output is not part of the compatibility guarantee.
- Existing raw-HTML escaping, diagnostics, inline code, frontmatter, plain themes/code, and default generated output remain covered and unchanged when highlighting is disabled.
- Fine-grained exact-pinned Shiki packages and parse5 work on supported Bun, the bundle stays below the investigation threshold, and the allowlisted packed CLI executes in a clean consumer.
- Concise docs, fixed-profile caveats, exact language list, opt-in config, canonical source/config/generated HTML, provider/client report, and deterministic evidence are complete.
- Every Phase 4 required client passes the same post-ESP fixture without blocking failures, delivered-source size is recorded below the clipping budget, and acceptable degradation is explicit. If this is not true, implementation may exist experimentally but the plan is not complete for broad compatibility.
- Independent implementation and compatibility-evidence reviews are resolved; no material security, validity, rendering, packaging, performance, or supported-client concern remains.
