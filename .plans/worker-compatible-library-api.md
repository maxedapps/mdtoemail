# Worker-compatible `mdtoemail` library API

> **Status:** Ready for implementation

## Outcome and boundaries

- **Problem and target:** `mdtoemail` is currently a Bun CLI whose rendering path is coupled to Bun/Node helpers and `satteri@0.9.4`; expose a supported, versioned library function that accepts a Markdown string and returns one complete email HTML document plus structured diagnostics, and make that same implementation executable in Cloudflare Workers and reusable by Emailed.
- **In scope:** one portable compiler used by both library and CLI; replacement of Sätteri with an exact-pinned pure-JavaScript unified/remark/HAST pipeline; portable escaping and UTF-8 sizing; preservation of current sanitizer, theme, GFM, frontmatter, diagnostics, and opt-in highlighting behavior; built ESM/declarations; actual workerd smoke tests; package and publish readiness for `mdtoemail@0.2.0`.
- **Out of scope:** server or sending features; provider integrations; arbitrary raw HTML passthrough; new Markdown syntax; new theme tokens; email-client compatibility claims; Emailed-specific Effect types; a second Bun-only rendering engine.
- **Approach:** replace the incompatible parser once for every consumer, keep filesystem/TOML/CLI policy in Bun-only adapters, expose a portable root API, and prove the packed artifact in both Bun and workerd before release.

## Key files, evidence, and decisions

| File or source                                                                                                                             | Why it matters                                                                                                                   | Decision or plan impact                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                                                                             | Only a TypeScript `bin` is exposed; there is no supported library export or emitted declaration build                            | Add root `exports`, built `bin`, exact runtime dependencies, build/pack/Worker scripts, and bump to `0.2.0` |
| `src/cli.ts`                                                                                                                               | Mixes CLI parsing, Bun I/O, compilation, diagnostics policy, strict mode, and final document creation                            | Retain Bun-specific I/O here, but route conversion through the public compiler                              |
| `src/config.ts`                                                                                                                            | Pure config/default logic and Bun TOML/path loading currently share one module                                                   | Split portable config from `config-loader.ts`; preserve CLI TOML/theme behavior                             |
| `src/markdown.ts`                                                                                                                          | Directly imports Sätteri and its plugin API                                                                                      | Replace with one unified/remark pipeline used by Bun and Worker                                             |
| `src/email.ts`                                                                                                                             | Sanitizer/wrapper uses Sätteri visitor context, `node:path`, and `Bun.escapeHTML`                                                | Convert sanitizer to a project-owned HAST transform and accept an explicit document title                   |
| `src/highlight.ts`                                                                                                                         | Opt-in Shiki rendering is coupled to Sätteri’s HAST plugin API                                                                   | Preserve semantics as an async project-owned HAST transform and include it in Worker execution tests        |
| `src/diagnostics.ts`                                                                                                                       | Uses `Buffer.byteLength` for the final-size warning                                                                              | Use `TextEncoder`; library always returns diagnostics while CLI owns printing/strict policy                 |
| `test/{markdown,email,highlight,html-validity,cli}.test.ts`                                                                                | Existing observable behavior and security regressions are already well covered                                                   | Reuse these as the engine-replacement contract; avoid broad incidental snapshots                            |
| `test/library.test.ts` (planned)                                                                                                           | No public string-in/library contract exists                                                                                      | Protect complete HTML, title, diagnostics, frontmatter, no-I/O, and CLI parity                              |
| `test/worker/` (planned)                                                                                                                   | A browser build is not evidence of workerd behavior                                                                              | Execute default and highlighted conversion in an actual modules-Worker runtime                              |
| `satteri@0.9.4` installed browser files                                                                                                    | Browser path creates shared Wasm memory and a child `Worker`                                                                     | Remove Sätteri; Cloudflare Workers do not support threading/Web Workers                                     |
| [Cloudflare Wasm](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)                                                     | Official runtime states that threading and Web Workers are unavailable                                                           | A threaded Sätteri WASI fallback cannot be the portable engine                                              |
| unified `11.0.5`, remark-parse `11.0.0`, remark-gfm `4.0.1`, remark-frontmatter `5.0.0`, remark-rehype `11.1.2`, rehype-stringify `10.0.1` | Exact current pure-JS pipeline versions; local Wrangler probe bundled to 476.74 KiB / 97.12 KiB gzip and executed GFM in workerd | Use this one engine for CLI and library; pin every package exactly                                          |

**Decisions:**

- Public API:

  ```ts
  compileMarkdownEmail(
    markdown: string,
    options?: {
      readonly title?: string;
      readonly config?: Config;
    },
  ): Promise<CompiledMarkdownEmail>
  ```

  `CompiledMarkdownEmail` returns complete `html`, immutable `diagnostics`, and `frontmatter`. `title` defaults to the empty string; the CLI passes the input basename to preserve current output. A supplied resolved `Config` is cloned and validated again at the library boundary, including safe theme-token checks; static TypeScript evidence is not treated as runtime validation.

- The function performs no filesystem, process, console, or network I/O. It returns warnings instead of enforcing strict mode. Invalid config and unrecoverable compilation remain failures; CLI `warnings` and `strict` remain presentation/policy settings.
- Replace Sätteri for both CLI and library. A dual-engine design is rejected because output, source-line diagnostics, and security behavior would drift.
- Preserve syntax highlighting in the root API. The Worker test and bundle budget decide whether a later optional subpath is needed; do not pre-split it.
- Frontmatter remains `{ kind, value } | null`; it is returned, not used as the document title or rendered body.
- Publish built JavaScript and declarations. Emailed consumes exact `mdtoemail@0.2.0`, not a sibling path, source copy, link, or range.

## Tasks

#### T1 — Establish the portable public contract

- **Change:**
  - Add `src/index.ts` exporting `compileMarkdownEmail`, `CompiledMarkdownEmail`, `CompileMarkdownEmailOptions`, `Config`, `Diagnostic`, and the resolved default config.
  - Add `src/compiler.ts` to validate/clone a caller-supplied resolved config and orchestrate Markdown rendering, complete-document wrapping, and final UTF-8 size diagnostics without I/O or CLI policy.
  - Make diagnostics returned from the public API immutable to callers.
- **Starts at:** `src/index.ts`, `src/compiler.ts`, `src/markdown.ts`, `src/email.ts`, `src/diagnostics.ts`.
- **Tests:** `test/library.test.ts` (library contract) protects string-in/complete-HTML-out, deterministic empty/escaped explicit title, returned diagnostics/frontmatter, cloned valid config, malformed/unsafe runtime config rejection, the 85 KiB UTF-8 warning boundary, and absence of filesystem/console side effects.
- **Verify:**
  - Run `bun test test/library.test.ts`; expect complete-document and no-I/O cases to pass.
  - Run `bun run typecheck`; expect the exported API and readonly result to type-check.

#### T2 — Separate portable config from Bun loading

- **Change:**
  - Keep `Config`, defaults, cloning, normalization, and validation—including a public resolved-config validator used by the compiler—in `src/config.ts` with no Bun/Node imports.
  - Move TOML files, named/path themes, current-directory discovery, and path resolution into `src/config-loader.ts`.
  - Keep the existing TOML schema, precedence, safe token validation, and CLI behavior unchanged.
- **Starts at:** `src/config.ts`, `src/config-loader.ts`, `src/cli.ts`, `test/config.test.ts`.
- **Tests:** `test/config.test.ts` (unit/integration) protects default and override semantics, TOML/theme path behavior at the Bun boundary, and rejection of unsafe tokens; `test/library.test.ts` proves importing/compiling does not read config files.
- **Verify:**
  - Run `bun test test/config.test.ts test/library.test.ts`; expect all config and no-I/O cases to pass.

#### T3 — Remove Bun and Node primitives from the compiler path

- **Change:**
  - Replace `Bun.escapeHTML` in generated wrapper attributes/text with a project-owned HTML escaping helper whose behavior matches current tests.
  - Replace `Buffer.byteLength` with `TextEncoder` UTF-8 sizing.
  - Change `renderEmailDocument` to receive the explicit title string; keep basename/path handling in CLI only.
  - Ensure no portable module references `Bun`, `process`, `Buffer`, `node:*`, or filesystem APIs.
- **Starts at:** `src/email.ts`, `src/diagnostics.ts`, `src/compiler.ts`, `src/cli.ts`.
- **Tests:** `test/email.test.ts` protects escaping and wrapper semantics; `test/diagnostics.test.ts` protects exact UTF-8 size boundaries; `test/cli.test.ts` protects filename-title compatibility.
- **Verify:**
  - Run `bun test test/email.test.ts test/diagnostics.test.ts test/cli.test.ts`; expect all existing security and CLI cases to pass.
  - After T7 builds `dist`, run `grep -R -E 'Bun\.|Buffer|node:|worker_threads|SharedArrayBuffer|satteri_napi' dist/index.js dist/compiler.js dist/markdown.js dist/email.js dist/diagnostics.js`; expect no matches.

#### T4 — Replace Sätteri with one portable Markdown/HAST engine

- **Change:**
  - Remove `satteri` and exact-pin unified `11.0.5`, remark-parse `11.0.0`, remark-gfm `4.0.1`, remark-frontmatter `5.0.0`, remark-rehype `11.1.2`, and rehype-stringify `10.0.1`.
  - Rebuild GFM/frontmatter parsing and serialization as one unified processor while preserving source positions and the current raw frontmatter contract for both YAML `---` and TOML `+++` blocks.
  - Convert `emailHastPlugin` into a project-owned HAST tree transform with the existing allowlist, URL policy, task-list transformation, diagnostics, styles, table alignment, footnotes, and raw-HTML escaping.
  - Treat semantic output and safety behavior as contractual; accept only reviewed serializer-byte changes, not a blanket snapshot rewrite.
- **Starts at:** `src/markdown.ts`, `src/email.ts`, `package.json`, `test/markdown.test.ts`, `test/email.test.ts`.
- **Tests:** existing Markdown/email tests plus focused engine fixtures protect GFM tables/alignment, task lists, YAML and TOML frontmatter `{ kind, value }` when enabled and delimiter-as-Markdown behavior when disabled, footnotes/IDs, source-line diagnostics, raw HTML escaping, unsafe URL rejection, nested styling, and image fallback behavior.
- **Verify:**
  - Run `bun test test/markdown.test.ts test/email.test.ts test/diagnostics.test.ts`; expect all named behavior contracts to pass.
  - Run `bun test test/html-validity.test.ts`; expect parse5 to report no document errors for representative fixtures.
- **Risk/recovery:** If unified exposes a genuinely different but valid tree for an existing fixture, update the narrow transform and assertion around the user-visible invariant; do not retain Sätteri as a fallback engine.

#### T5 — Port syntax highlighting onto the shared HAST pipeline

- **Change:**
  - Convert the current Sätteri highlighting plugin into an async project-owned HAST transform applied after sanitization.
  - Preserve the fixed light/dark profiles, supported languages, range/line-number metadata, source/token/line limits, fallback diagnostics, and malicious-source escaping.
  - Keep highlighting opt-in and avoid initialization when disabled.
- **Starts at:** `src/highlight.ts`, `src/markdown.ts`, `test/highlight.test.ts`, `test/html-validity.test.ts`.
- **Tests:** current highlighting and HTML-validity suites protect tokenizer contracts, exact controlled markup, limits, disabled behavior, unsupported/error fallback, dark profile, line numbers, and structural injection resistance.
- **Verify:**
  - Run `bun test test/highlight.test.ts test/html-validity.test.ts`; expect all highlighting and validity fixtures to pass.

#### T6 — Rewire the CLI through the public compiler

- **Change:**
  - Make `src/cli.ts` load CLI config/source, call `compileMarkdownEmail`, print returned diagnostics, enforce strict mode before writing, and write the returned complete HTML.
  - Preserve arguments, defaults, overwrite/output paths, warning suppression, strict behavior, pretty output, themes, help/version text, and error wording where contractual.
  - Remove the CLI’s duplicate assembly path.
- **Starts at:** `src/cli.ts`, `test/cli.test.ts`, `test/library.test.ts`.
- **Tests:** CLI tests protect observable command behavior; a parity case asserts CLI output equals the library output for the same source, resolved config, and basename title.
- **Verify:**
  - Run `bun test test/cli.test.ts test/library.test.ts`; expect all legacy CLI cases and parity to pass.

#### T7 — Build and package a supported library and CLI

- **Change:**
  - Add an emit configuration producing ESM JavaScript, declarations, source maps, and the Bun CLI under `dist/`.
  - Point root `exports`/`types` to `dist/index.*` and `bin.mdtoemail` to `dist/cli.js`; importing the root must not execute CLI code.
  - Update `files`, README library usage/runtime support, and package scripts; bump the package to `0.2.0`.
  - Remove Sätteri/native artifacts from the lockfile and ensure all new runtime/tooling versions are exact-pinned.
- **Starts at:** `package.json`, `tsconfig.json`, `tsconfig.build.json`, `README.md`, `bun.lock`.
- **Tests:** fast source-level tests protect API/CLI behavior; the packed-candidate workflow in T8 protects actual emitted package contents and runtime resolution.
- **Verify:**
  - Run `bun run build`; expect `dist/index.js`, `dist/index.d.ts`, and `dist/cli.js`.

#### T8 — Validate one packed candidate in Bun and workerd

- **Change:**
  - Add a candidate script that builds and packs once to a temporary directory, inspects that exact tarball, and installs the same bytes into clean Bun and modules-Worker fixtures.
  - Have the Bun fixture import the package root, compile one message, validate declarations, and execute the installed `mdtoemail --version` binary.
  - Have one bounded Worker runner start local Wrangler/workerd, wait on observable readiness, exercise default and highlighted TypeScript compilation through the installed tarball, assert HTML/diagnostics, capture dry-run upload size, and always stop the process.
  - Pin Wrangler and the fixture compatibility date; require no `nodejs_compat` flag. Record bundle size without an arbitrary tiny threshold; fail on Cloudflare’s actual limit or startup/runtime failure.
- **Starts at:** `test/package-candidate.ts`, `test/worker/worker.ts`, `test/worker/wrangler.jsonc`, `package.json`.
- **Tests:** the one packed-candidate workflow protects package contents, root import, declarations, built CLI, actual Worker compatibility, GFM, unsafe-link diagnostics, complete HTML, highlighting, startup, and process/temp cleanup.
- **Verify:**
  - Run `bun run test:candidate`; expect intended dist/docs/examples/license/config contents, clean Bun success, a valid Wrangler dry-run, both workerd responses, recorded upload size, and no retained process/temp installation.
- **Risk/recovery:** If Shiki alone exceeds runtime/startup limits, isolate its default tokenizer behind an optional `mdtoemail/highlight` export and require explicit tokenizer composition; do not weaken default compiler portability or silently ignore enabled highlighting.

#### T9 — Release the prerequisite version

- **Change:**
  - Run the complete local/Worker/package validation ladder against exact `0.2.0` bytes.
  - Publish `mdtoemail@0.2.0` through the human owner’s authenticated npm workflow and verify registry metadata/tarball integrity.
  - Tag/release the same commit and provide the exact version/integrity to Emailed; do not publish from a dirty checkout.
- **Starts at:** `package.json`, `README.md`, release workflow/operator environment.
- **Tests:** packed-artifact checks from T8 run against the publish candidate; registry installation after publish protects that consumers receive the same usable API.
- **Verify:**
  - Run `bun test && bun run typecheck && bun run build && bun run test:candidate`; expect all 109 existing tests plus new cases, clean Bun package checks, and Worker smoke to pass.
  - Run `npm view mdtoemail@0.2.0 version dist.integrity --json`; expect version `0.2.0` and the integrity of the published candidate.
- **Risk/recovery:** Publishing is a human credentialed action. If the package name cannot be claimed, stop and choose a final scoped package name before changing Emailed; do not fall back to a mutable Git branch dependency.

## Final acceptance

- **Checks:** `bun test`, `bun run typecheck`, `bun run build`, the single `bun run test:candidate` packed-artifact/Bun/workerd workflow, portable bundle audit, and post-publish registry install all pass; test sensitivity comes from the known pre-change failures (no root export and Sätteri’s unsupported Worker path) plus existing unsafe-input regression fixtures.
- **End state:** Bun CLI and Cloudflare Worker consumers call one implementation; the root package compiles a Markdown string into complete conservative email HTML with structured diagnostics; no portable path uses Bun/Node/Sätteri; `mdtoemail@0.2.0` is exact and consumable by Emailed.
- **Deferrals or blockers:** full email-client qualification and new syntax/themes remain deferred. npm publication requires the human owner; Emailed compiler integration waits for the released exact version.
