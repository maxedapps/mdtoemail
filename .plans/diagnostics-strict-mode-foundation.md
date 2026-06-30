# Plan: Diagnostics and Strict Mode Foundation

## Summary

Add the first diagnostics layer to `mdtoemail` so the CLI explains when the email-safe renderer changes, escapes, or drops content for email-safety reasons. The milestone should collect structured diagnostics during Markdown rendering, print them to stderr by default, and optionally fail conversion in strict mode for warning-severity diagnostics.

This builds directly on the current Sätteri HAST sanitizer/email renderer. It should not expand the renderer into a full sanitizer, add dependencies, or add broad heuristic diagnostics unrelated to behavior the converter can already observe.

## Clarification status

No clarification is needed. Scope is clear: add diagnostics and strict mode for already-detected sanitizer/renderer events.

## Confirmed requirements and assumptions

- Use TypeScript and Bun.
- Add no new dependencies.
- Keep implementation simple and incremental.
- Preserve current CLI behavior; additive flags are allowed if they improve usability.
- Use TOML config.
- Add config only for behavior implemented in this milestone.
- Continue using Sätteri `0.9.4` and its plugin `data` bag.
- Diagnostics print by default.
- Strict mode should fail before writing output, but only for warning-severity diagnostics, not benign informational transforms.
- No server, no email sending, no external sanitizer package.
- Diagnostics are advisory; they should not claim complete security or full email-client compatibility.

## Relevant codebase findings

Current renderer/converter state:

- `src/cli.ts`
  - parses CLI args
  - loads config
  - reads Markdown
  - calls `renderMarkdown(markdown, config)`
  - wraps output with `renderEmailDocument(...)`
  - writes HTML
- `src/markdown.ts`
  - calls `markdownToHtml(...)`
  - passes `hastPlugins: [emailHastPlugin(config)]`
  - currently returns `{ html, frontmatter }`
- `src/email.ts`
  - owns HAST sanitizer and email wrapper
  - currently detects/remediates useful diagnostic events but does not record them:
    - unsafe link URLs are stripped
    - unsafe image URLs remove the image element
    - non-checkbox `<input>` and unknown/disallowed elements are removed
    - raw HAST nodes are escaped
    - task-list checkboxes are transformed to text symbols
    - image `alt` is kept if present
- `src/config.ts`
  - current `Config.email` only has `containerWidth`
  - explicit TOML validation/mapping is simple and should be extended in place
- `mdtoemail.example.toml`
  - currently documents existing config fields only
  - `markdown.raw_html` exists, but final email-safe output escapes raw HTML regardless; this needs clearer comments
- `test/markdown.test.ts`
  - already covers unsafe links/images, raw HTML escaping, task-list replacement, footnotes, table alignment
- `test/cli.test.ts`
  - currently verifies successful rendering but not stderr diagnostics/strict behavior
- `test/email.test.ts`
  - covers URL validation and wrapper structure

Sätteri API findings from installed type declarations:

- `markdownToHtml(source, options)` returns `MarkdownToHtmlResult` with:
  - `html`
  - `frontmatter`
  - `data`
- `CompileOptions.data` seeds a document-level mutable data bag.
- HAST visitor context exposes the same `ctx.data` object.
- HAST visitor context also has `ctx.report(...)` and `ctx.getDiagnostics()`, but the project can use the `data` bag directly for its own stable diagnostic shape.
- The HAST `raw` visitor accepts `(node, ctx)`, so raw HTML diagnostics can be recorded there.
- The `data` option should be a fresh object per compile.

## Chosen implementation strategy

Add a small project-owned diagnostics module and collect diagnostics through Sätteri’s `ctx.data` bag.

Use one new focused module:

```txt
src/diagnostics.ts
```

Exports:

```ts
export type DiagnosticSeverity = "warning" | "info";

export type DiagnosticCode =
  | "unsafe-link-url"
  | "unsafe-image-url"
  | "unsupported-element"
  | "raw-html-escaped"
  | "task-list-input-transformed"
  | "missing-image-alt";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
}

export function createDiagnosticData(): Record<string, unknown>;
export function addDiagnostic(data: Record<string, unknown>, diagnostic: Diagnostic): void;
export function addDiagnosticOnce(data: Record<string, unknown>, diagnostic: Diagnostic): void;
export function getDiagnostics(data: Record<string, unknown>): Diagnostic[];
export function countWarnings(diagnostics: Diagnostic[]): number;
export function formatDiagnostic(diagnostic: Diagnostic): string;
```

Then:

- `src/email.ts` adds diagnostics at top-level HAST visitors where `ctx.data` is available.
- `src/markdown.ts` creates a fresh diagnostic data bag, passes it to Sätteri, and returns `diagnostics` alongside `html` and `frontmatter`.
- `src/cli.ts` prints diagnostics to stderr when enabled and fails in strict mode before writing output if any warning-severity diagnostics exist.
- `src/config.ts` adds warning/strict fields under `[email]`.
- CLI adds optional config overrides for CI ergonomics:
  - `--strict`
  - `--no-warnings`

Rationale:

- The diagnostics belong to project behavior, not Sätteri internals.
- The Sätteri `data` bag is designed for plugin-to-caller communication.
- Keeping a simple array in `data` avoids callback plumbing.
- Using project-owned diagnostics keeps CLI formatting stable and testable.
- Minimal severity is necessary so strict mode does not fail on benign transforms like GFM task-list checkbox replacement.
- `--strict` is useful for CI and is additive; existing CLI invocations keep working.

## Alternatives considered

### 1. Use only `ctx.report(...)`

Rejected for this milestone. Sätteri diagnostics exist, but they use Sätteri’s shape and are broader than this project needs. Project-owned diagnostics give stable codes, severity semantics, and clearer tests. `ctx.report(...)` could be mirrored later if useful for plugin consumers.

### 2. Pass a callback into `emailHastPlugin(config, onDiagnostic)`

Rejected. It adds callback plumbing and is less aligned with Sätteri’s compile pipeline. The `data` bag is intended for plugin-to-caller state.

### 3. Print diagnostics directly from `src/email.ts`

Rejected. Rendering should not write to stderr. CLI owns user I/O.

### 4. TOML-only strict mode

Rejected after review. Strict mode is especially useful for CI, where `mdtoemail --strict input.md` is more ergonomic than creating a temporary config file. TOML remains the persistent configuration path; CLI flags are simple per-run overrides.

### 5. Strict mode fails on every diagnostic

Rejected. That would make strict mode fail for normal GFM task lists, which are transformed into email-compatible text symbols. Strict mode should fail on warning-severity diagnostics only.

### 6. Collect broad heuristic email warnings now

Rejected. Examples include wide tables, long code lines, huge images, missing document title, and unsupported CSS. Useful later, but this milestone should focus on diagnostics for changes the converter already performs.

## Target behavior

### Diagnostics printed by default

If conversion succeeds and diagnostics exist, print diagnostics to stderr after rendering:

```txt
Warning [unsafe-link-url]: Removed unsafe link URL "javascript:alert(1)".
Info [task-list-input-transformed]: Converted task-list checkbox inputs to plain text symbols for email compatibility.
```

Keep output concise and deterministic. Do not print a stack trace.

### Diagnostics can be disabled

If `email.warnings = false` or `--no-warnings` is used, do not print diagnostics.

Diagnostics should still be collected internally because strict mode may need them.

### Strict mode fails before output write

If strict mode is enabled and any warning-severity diagnostics exist:

- render Markdown and collect diagnostics
- print diagnostics to stderr only when diagnostics output is enabled
- throw a clean CLI error such as:

```txt
Strict mode failed with 2 warning(s).
```

- do not write the output file
- exit non-zero

Info-severity diagnostics do not fail strict mode.

### Config and CLI precedence

Persistent TOML config:

```toml
[email]
warnings = true
strict = false
```

CLI overrides:

```txt
--strict        Fail if warning-severity diagnostics are produced
--no-warnings   Do not print diagnostics
```

Precedence:

1. Load TOML/default config.
2. Apply CLI overrides in memory for this run only.
3. Render and enforce diagnostics behavior.

### Diagnostic events to implement now

#### `unsafe-link-url`

- Severity: `warning`
- When an `<a>` has an original `href` string but it is rejected by `isAllowedUrl(...)`.
- Sanitized output keeps link text but removes `href`.
- Message example:

```txt
Removed unsafe link URL "javascript:alert(1)".
```

#### `unsafe-image-url`

- Severity: `warning`
- When an `<img>` has a missing or rejected `src`.
- Sanitized output removes the image.
- Message examples:

```txt
Removed image with unsafe URL "javascript:alert(1)".
Removed image without a valid source URL.
```

#### `unsupported-element`

- Severity: `warning`
- When non-checkbox `input` or any unknown/disallowed real HAST element is removed.
- Include the tag name in the message.
- Note: raw user HTML such as `<iframe>` is normally handled as `raw-html-escaped`, not `unsupported-element`, because raw HAST nodes do not reach the element visitor as real elements.

#### `raw-html-escaped`

- Severity: `warning`
- When a raw HAST node is converted to a text node.
- This warning should fire whether `config.markdown.rawHtml` is `true` or `false`, because final email-safe output escapes arbitrary raw HTML in both cases.
- Use `addDiagnosticOnce` so it appears at most once per document.
- Message example:

```txt
Escaped raw HTML because arbitrary HTML is not supported in email-safe output.
```

#### `task-list-input-transformed`

- Severity: `info`
- When a task-list checkbox input is converted to `☑` or `☐`.
- Use `addDiagnosticOnce` so it appears at most once per document.
- Does not fail strict mode.

#### `missing-image-alt`

- Severity: `warning`
- When an allowed image is retained but the `alt` property is absent.
- Do not warn for `alt=""`; empty alt can be intentional for decorative images and Markdown often emits an empty string for `![](url)`.
- Message example:

```txt
Image "https://example.com/a.png" is missing alt text.
```

## Implementation tasks

### 1. Add `src/diagnostics.ts`

Create a tiny diagnostics module.

Implementation guidance:

- Use a namespaced data-bag key, e.g. `"mdtoemail.diagnostics"`.
- Store diagnostics as a mutable array at that key.
- `createDiagnosticData()` returns a fresh object every render.
- `getDiagnostics(...)` returns a shallow copy or guarded array, not the original mutable reference.
- `addDiagnosticOnce(...)` dedupes by diagnostic code only; this is enough for document-level diagnostics such as raw HTML and task-list transforms.
- `formatDiagnostic(...)` maps severity labels to `Warning` and `Info`.

Example shape:

```ts
const diagnosticsKey = "mdtoemail.diagnostics";

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const label = diagnostic.severity === "warning" ? "Warning" : "Info";
  return `${label} [${diagnostic.code}]: ${diagnostic.message}`;
}
```

Keep runtime type guards simple. Do not add severity levels beyond `warning` and `info` yet.

### 2. Extend `Config.email`

Update `src/config.ts`:

```ts
email: {
  containerWidth: number;
  warnings: boolean;
  strict: boolean;
}
```

Defaults:

```ts
warnings: true,
strict: false,
```

TOML mappings:

```txt
warnings -> warnings
strict -> strict
```

Validation errors:

```txt
Invalid config: email.warnings must be a boolean.
Invalid config: email.strict must be a boolean.
```

Update `mdtoemail.example.toml`:

```toml
[email]
container_width = 600
warnings = true
strict = false
```

Also update comments around `markdown.raw_html` to clarify current behavior:

```toml
# Reserved for future unsafe/raw HTML handling. Email-safe output currently escapes raw HTML either way.
raw_html = false
```

Update config tests:

- defaults include `warnings: true`, `strict: false`
- full override maps both fields
- partial override preserves defaults
- invalid `email.strict = "yes"` throws a clear error

### 3. Update `RenderedMarkdown`

Update `src/markdown.ts`:

```ts
import { createDiagnosticData, getDiagnostics, type Diagnostic } from "./diagnostics";

export interface RenderedMarkdown {
  html: string;
  frontmatter: Frontmatter | null;
  diagnostics: Diagnostic[];
}
```

In `renderMarkdown`:

```ts
const data = createDiagnosticData();
const result = await markdownToHtml(markdown, {
  features: markdownFeatures(config),
  hastPlugins: [emailHastPlugin(config)],
  data,
});

return {
  html: result.html,
  frontmatter: result.frontmatter,
  diagnostics: getDiagnostics(result.data),
};
```

Use `result.data` to follow Sätteri’s result contract, even though it is expected to be the same object reference.

### 4. Add diagnostics in `src/email.ts`

Import:

```ts
import { addDiagnostic, addDiagnosticOnce } from "./diagnostics";
```

Important implementation detail:

- Emit diagnostics from the top-level `visit(node, ctx)` and `raw(node, ctx)` functions where `ctx.data` is in scope.
- Do not try to call `ctx.data` from helpers typed only as `ElementMutationContext`.
- If a helper needs to report what happened, make it return a small result/signal, or pass the full Sätteri context explicitly. Prefer emitting from `visit` to keep helpers simple.

Suggested top-level visitor flow:

```ts
visit(node, ctx) {
  if (node.tagName === "input") {
    if (isCheckbox(node.properties)) {
      addDiagnosticOnce(ctx.data, { ...info task-list diagnostic... });
      return { type: "text", value: ... };
    }

    addDiagnostic(ctx.data, { ...unsupported input diagnostic... });
    ctx.removeNode(node);
    return;
  }

  if (!allowedElements.has(node.tagName)) {
    addDiagnostic(ctx.data, { ...unsupported element diagnostic... });
    ctx.removeNode(node);
    return;
  }

  const originalProperties = { ...node.properties };

  if (node.tagName === "a" && typeof originalProperties.href === "string" && !isAllowedUrl(originalProperties.href, "link")) {
    addDiagnostic(ctx.data, { ...unsafe-link diagnostic... });
  }

  if (node.tagName === "img") {
    // diagnose invalid/missing src and missing absent alt before applySafeProperties may remove the node
  }

  stripProperties(node, ctx);
  applySafeProperties(node, originalProperties, ctx, config);
}
```

Raw visitor must accept context:

```ts
raw(node, ctx) {
  addDiagnosticOnce(ctx.data, {
    code: "raw-html-escaped",
    severity: "warning",
    message: "Escaped raw HTML because arbitrary HTML is not supported in email-safe output.",
  });
  return { type: "text", value: node.value };
}
```

Message construction:

- Use `JSON.stringify(value.trim())` for URLs in messages.
- Avoid including raw HTML snippets in messages.
- Do not warn for safe class/style/id stripping yet; that would be too noisy.

### 5. Update CLI warning/strict flow

Extend CLI options:

```ts
strict: { type: "boolean" },
"no-warnings": { type: "boolean" },
```

Update help text:

```txt
      --strict          Fail on warning diagnostics
      --no-warnings     Do not print diagnostics
```

Apply CLI overrides after config load:

```ts
const config = await loadConfig(values.config);
const effectiveConfig = applyCliOverrides(config, values);
```

Keep this simple. A shallow copy is enough:

```ts
function applyCliOverrides(config: Config, values: ParsedValues): Config {
  return {
    ...config,
    email: {
      ...config.email,
      strict: values.strict ? true : config.email.strict,
      warnings: values["no-warnings"] ? false : config.email.warnings,
    },
  };
}
```

Change `renderInputMarkdown` to return the full `RenderedMarkdown`, not only HTML.

Suggested flow in `main()`:

```ts
const rendered = await renderInputMarkdown(markdown, effectiveConfig);
printDiagnostics(rendered.diagnostics, effectiveConfig);

const warningCount = countWarnings(rendered.diagnostics);
if (effectiveConfig.email.strict && warningCount > 0) {
  throw new Error(`Strict mode failed with ${warningCount} warning(s).`);
}

const html = renderEmailDocument(rendered.html, input, effectiveConfig);
await Bun.write(output, html);
```

Ordering decisions:

- Print diagnostics before strict failure, but only when diagnostics output is enabled.
- Fail before `renderEmailDocument(...)` and `Bun.write(...)` to avoid writing output in strict mode.
- Keep strict failure outside `renderInputMarkdown` so it does not get wrapped as `Could not render Markdown.`.

Add local helper in CLI:

```ts
function printDiagnostics(diagnostics: Diagnostic[], config: Config): void {
  if (!config.email.warnings) return;
  for (const diagnostic of diagnostics) {
    console.error(formatDiagnostic(diagnostic));
  }
}
```

### 6. Update tests

#### `test/diagnostics.test.ts`

Add focused tests for diagnostics helpers:

- `addDiagnostic` stores/retrieves diagnostics.
- `addDiagnosticOnce` dedupes by code.
- `countWarnings` counts only warning-severity diagnostics.
- `formatDiagnostic` returns `Warning [code]: message` and `Info [code]: message`.

#### `test/config.test.ts`

Update expected config shapes and overrides for `email.warnings` / `email.strict`.

#### `test/markdown.test.ts`

Extend existing tests to check diagnostics returned by `renderMarkdown`:

- clean basic Markdown produces no diagnostics
- safe link produces no diagnostics
- unsafe link produces `unsafe-link-url` warning
- unsafe image produces `unsafe-image-url` warning
- retained image with absent alt produces `missing-image-alt` warning, if such a fixture can be generated through Sätteri; otherwise cover helper behavior later and skip forced construction
- raw HTML produces one `raw-html-escaped` warning even when there are multiple raw nodes
- task list produces one `task-list-input-transformed` info diagnostic
- task-list-only document has zero warning-severity diagnostics
- diagnostic order follows document order for mixed unsafe content

Be careful:

- Because raw HTML is escaped via HAST `raw`, tags such as `<iframe>` should produce `raw-html-escaped`, not `unsupported-element`.
- Markdown `![](url)` commonly produces `alt=""`; do not treat this as missing alt.

#### `test/cli.test.ts`

Add tests using temp TOML files and CLI flags:

1. Default diagnostics print to stderr but conversion succeeds:
   - input: `[bad](javascript:alert(1))`
   - exit code `0`
   - stdout includes `Wrote ...`
   - stderr includes `Warning [unsafe-link-url]`
   - output file exists

2. `email.warnings = false` suppresses diagnostics:
   - same input
   - exit code `0`
   - stderr does not include `Warning [`

3. `--no-warnings` suppresses diagnostics even if config enables them.

4. `email.strict = true` fails before writing output for warning diagnostics:
   - input: `[bad](javascript:alert(1))`
   - exit code non-zero
   - stderr includes warning if warnings are enabled
   - stderr includes `Strict mode failed with 1 warning(s).`
   - output file does not exist

5. `--strict` fails before writing output even if config has strict disabled.

6. Strict mode succeeds with clean input:
   - input: `[ok](https://example.com)`
   - exit code `0`
   - output file exists

7. Strict mode succeeds for info-only diagnostics:
   - input: `- [x] Done`
   - strict enabled
   - exit code `0`
   - stderr may include `Info [task-list-input-transformed]` if warnings output is enabled
   - output file exists

### 7. Manual verification

Run:

```bash
printf '[Bad](javascript:alert(1))\n\n![Alt](https://example.com/a.png)\n\n<img src="x">\n\n- [x] Done' > /tmp/mdtoemail-warn.md
bun run src/cli.ts /tmp/mdtoemail-warn.md -o /tmp/mdtoemail-warn.html
```

Expected:

- output file written
- stderr contains warnings/info for unsafe link, raw HTML, and task-list transform
- safe image with non-empty alt does not warn for missing alt

Strict mode:

```bash
bun run src/cli.ts /tmp/mdtoemail-warn.md --strict -o /tmp/mdtoemail-strict.html
```

Expected:

- non-zero exit
- no output file
- diagnostics printed unless `--no-warnings` is also provided
- clean error, no stack trace

Info-only strict mode:

```bash
printf -- '- [x] Done' > /tmp/mdtoemail-info.md
bun run src/cli.ts /tmp/mdtoemail-info.md --strict -o /tmp/mdtoemail-info.html
```

Expected:

- exit code `0`
- output file written
- task-list info diagnostic may print

Standard verification:

```bash
bun test
bun run typecheck
bun run build
bun run compile
```

Known compiled-binary caveat remains due to Sätteri native binding; do not treat standalone packaging as solved.

## Files likely to change

```txt
src/cli.ts
src/config.ts
src/diagnostics.ts
src/email.ts
src/markdown.ts
mdtoemail.example.toml
test/cli.test.ts
test/config.test.ts
test/diagnostics.test.ts
test/markdown.test.ts
```

Possible:

```txt
PROJECT.md
```

Update `PROJECT.md` only if we want to record newly implemented diagnostics/strict-mode behavior and the remaining compiled-binary caveat.

## Interface/config changes

New TOML config keys:

```toml
[email]
warnings = true
strict = false
```

New CLI flags:

```txt
      --strict          Fail on warning diagnostics
      --no-warnings     Do not print diagnostics
```

Backward compatibility:

- Existing configs remain valid.
- Existing commands keep working.
- Defaults preserve successful conversion behavior.
- New default diagnostic output means commands with unsafe/unsupported content may now write to stderr while still exiting `0`.
- Strict mode is opt-in.
- `markdown.raw_html` remains accepted but is currently effectively reserved/no-op for final email-safe output; raw HTML is escaped either way.

## Risks, edge cases, and mitigations

### Strict mode false positives

Risk: If strict mode fails on benign transforms, normal documents with GFM task lists become unusable in strict mode.

Mitigation: Add severity now. Strict mode fails only on `warning`, not `info`. Add a strict-mode task-list test.

### Diagnostic spam

Risk: A document with many task-list items or raw HTML chunks could emit too many repeated diagnostics.

Mitigation: Use `addDiagnosticOnce` for document-level conditions such as raw HTML escaping and task-list transformation. Keep per-instance warnings for unsafe URLs because users need to know each affected resource.

### Strict mode writes partial output

Risk: If strict mode is checked after `Bun.write`, users get output even though conversion failed.

Mitigation: In CLI, check strict mode before wrapping/writing.

### Tests become brittle due exact messages

Risk: Full warning text assertions can make tests noisy.

Mitigation: Assert stable code substrings such as `Warning [unsafe-link-url]` in CLI tests; detailed formatting can be covered in diagnostics unit tests.

### `raw_html` behavior confusion

Risk: Users may expect `raw_html = true` to pass through raw HTML, but email-safe output escapes it.

Mitigation: Make the example TOML comment explicit. Add diagnostics for raw HTML escaping. Record in `PROJECT.md` or future README that raw HTML passthrough requires a dedicated unsafe mode or real raw HTML sanitizer.

### Sätteri data bag typing

Risk: `ctx.data` / `result.data` is loosely typed.

Mitigation: Use small type guards in `diagnostics.ts`; always initialize data with `createDiagnosticData()`.

### Helper plumbing mistakes

Risk: Diagnostics are needed inside logic currently split into helpers that do not receive `ctx.data`.

Mitigation: Emit diagnostics in top-level `visit(node, ctx)` before calling helpers, or return small signals from helpers. Do not widen helper signatures unnecessarily unless it clearly simplifies code.

### Missing unsupported-element cases

Risk: Most raw unsupported HTML is escaped as raw nodes, not visited as real elements.

Mitigation: Define `unsupported-element` as applying to generated/real HAST elements that reach the element visitor. Raw HTML gets `raw-html-escaped`.

## Claude review notes incorporated

The draft plan was reviewed with the Claude CLI. Useful feedback incorporated:

- Added minimal diagnostic severity because strict mode failing on every diagnostic would make normal GFM task lists fail.
- Strict mode now fails only on warning-severity diagnostics.
- Added explicit `--strict` and `--no-warnings` CLI overrides for CI/per-run usability.
- Made `addDiagnosticOnce` required rather than optional.
- Updated implementation guidance so diagnostics are emitted from top-level HAST visitors where `ctx.data` is available, avoiding helper typing/plumbing errors.
- Explicitly noted `raw(node, ctx)` must accept context to record raw HTML diagnostics.
- Clarified that `markdown.raw_html` is currently reserved/no-op for final email-safe output because raw HTML is escaped regardless.
- Avoided warning on `alt=""`, since empty alt can be intentional for decorative images.
- Added tests for strict mode with info-only task-list diagnostics and diagnostic order.

## Open questions

None requiring user input.

Implementation assumptions:

- Diagnostics print by default.
- Strict mode is available via TOML and `--strict`.
- `--no-warnings` suppresses diagnostic output but not strict-mode enforcement.
- Strict mode prevents writing output if any warning-severity diagnostic exists.
- Info diagnostics do not fail strict mode.
