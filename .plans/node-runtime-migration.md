# Migrate mdtoemail to Node.js, TypeScript 7, and the Oxc/tsdown toolchain

> **Status:** Ready for implementation

## Outcome and boundaries

- **Problem and target:** Replace Bun as the required runtime, package manager, test runner, and bundler with a Node/npm toolchain built around TypeScript 7, tsdown, Vitest, Oxlint type-aware linting, Oxfmt, and the vendored `dmmulroy/anti-slop` plugin. Preserve the package's CLI, ESM library API, TOML configuration, generated HTML and diagnostics, and Cloudflare Worker compatibility.
- **Current failure evidence:** `node -e 'import("./dist/index.js")'` currently fails with `ERR_MODULE_NOT_FOUND` because the `tsc` output contains extensionless relative ESM imports; `node dist/cli.js --version` fails because the CLI is bundled for Bun. `src/cli.ts`, `src/config-loader.ts`, and `test/package-candidate.ts` also call Bun APIs directly.
- **In scope:** Node-native source I/O and execution; npm and `package-lock.json`; TypeScript `7.0.2`; ESM-only tsdown builds for the portable library and Node CLI; declaration generation; `smol-toml`; Vitest; Oxfmt; Oxlint with type-aware rules; the vendored generic anti-slop plugin; exact packed-artifact validation; Node CI; active documentation; publication of `0.3.0`.
- **Out of scope:** CommonJS, a dual Bun/Node runtime, raw Vite or Vite+ adoption, browser CLI support, changing Markdown/email semantics, changing the TOML schema, changing unified/Shiki dependencies, linting or reformatting dependency/vendored source, introducing a schema framework solely to satisfy lint, a server, automated npm publishing, a broad OS matrix, and rewrites of historical plans/reports.
- **Approach:** Target Node `>=22.18.0` and stay ESM-only. Use TypeScript 7 as the independent typechecker, tsdown as the production builder, Vitest as the behavior runner, npm as the canonical package manager, and Oxc tools for formatting and first-party linting. Build the portable library and Node CLI as separate tsdown configurations so Node-only modules cannot leak into the Worker-compatible entry. Install every anti-slop rule unchanged first, measure the actual first-party findings, then fix only evidence-backed issues without touching vendored or dependency code.

### Fixed decisions

- **Runtime floor:** Node `>=22.18.0`. It supports default TypeScript stripping and `import.meta.main`; it also matches tsdown `0.22.14`'s minimum Node 22 engine.
- **Release:** `mdtoemail@0.2.0` was published on 2026-08-18 with a Bun engine, so this migration is `0.3.0`; do not reuse `0.2.0`.
- **Package format:** ESM-only. Do not add a CommonJS output or compatibility wrapper without a demonstrated consumer.
- **Builder:** Standalone `tsdown@0.22.14`, not raw Vite. Keep Vite+ deferred until its broader runtime/package-manager ownership provides demonstrated value.
- **Build separation:** `src/index.ts` uses `platform: "neutral"`, ES2022, declarations, and no Node modules. `src/cli.ts` uses `platform: "node"`, keeps the Node shebang, and emits no declarations. Both bundle first-party modules but leave declared runtime dependencies external.
- **Exports:** Keep `package.json` `main`, `types`, `exports`, and `bin` explicit. Do not let tsdown rewrite the manifest; validate it with publint, Are The Types Wrong, and the candidate test.
- **TypeScript:** Exact-pin `typescript@7.0.2`. Use `isolatedDeclarations` so tsdown takes its Oxc declaration path and does not depend on TypeScript 7's unavailable programmatic API.
- **Type checking:** Keep `tsc --noEmit` as an independent required gate. Enable Oxlint type-aware rules, but do not replace `tsc` with Oxlint's experimental `typeCheck` option.
- **TOML:** Exact-pin `smol-toml@1.8.0`; preserve path precedence and stable mdtoemail error prefixes rather than parser-vendor wording.
- **Tests:** Exact-pin `vitest@4.1.10`; preserve matcher intent and existing behavior coverage rather than rewriting the suite to `node:assert`.
- **Anti-slop:** Vendor the generic plugin from reviewed upstream commit `6d538555cb151d4121ed51a27db81890eacf8ae9`; enable all 15 generic rules at `error`; do not enable the Effect plugin because this package does not depend on Effect. Ignore the vendored plugin itself in lint/format.
- **Lint policy:** First run and summarize the unmodified rules. Fix clear first-party violations with inference, `as const`, `satisfies`, named contracts, or explicit boundary parsing. Do not broadly disable rules, add unsafe casts, change public behavior, add a schema dependency, or edit vendored rules merely to make the command green. Escalate if a rule is systematically incompatible with a legitimate boundary.
- **Formatting:** Use Oxfmt defaults close to the repository's style (double quotes, semicolons, two spaces, 100 columns), but defer import/package sorting. Keep the initial formatter rewrite separate from semantic and lint-fix commits.
- **Release bytes:** Build one npm tarball, validate those exact bytes in clean Node and Worker fixtures, dry-run and publish that same tarball, then verify its registry integrity.

## Key files, evidence, and decisions

| File or source | Why it matters | Decision or plan impact |
|---|---|---|
| `.plans/node-runtime-migration.md` | Existing Bun-to-Node plan chose unbundled `tsc` emit | This revision supersedes that build decision and incorporates TypeScript 7, tsdown, Oxc tooling, anti-slop, and the now-required `0.3.0` release |
| `.reviews/node-typescript7-toolchain-migration-decomplex.md` | Prevention review of the revised structure and dependencies | Confirms the two build targets, exact-tarball path, bounded candidate lifecycle, and requested tool stack are proportionate; no complexity findings remain |
| `package.json`, `bun.lock` | Bun scripts, Bun engine/package-manager metadata, TypeScript 6, and no lint/format/test tooling | Move to Node/npm, exact-pinned migration tools, `package-lock.json`, version `0.3.0`, and explicit ESM package metadata |
| `tsconfig.json`, `tsconfig.build.json` | Bundler resolution, Bun types, and a separate `tsc` emit config | Use one TypeScript 7 no-emit config plus tsdown; remove `tsconfig.build.json` if no longer referenced |
| `src/cli.ts` | Bun shebang/I/O, JSON version import, CLI entry guard | Use Node fs, Node shebang, JSON import attributes, `.ts` source specifiers, and `import.meta.main` |
| `src/config-loader.ts` | `Bun.file` and `Bun.TOML.parse`; configuration/theme trust boundary | Use `readFile` and `smol-toml`; preserve missing-file, precedence, and error contracts |
| `src/index.ts`, `src/compiler.ts`, `src/config.ts`, `src/markdown.ts`, `src/email.ts`, `src/highlight.ts` | Portable public graph and public declarations | Bundle only first-party modules into the neutral entry; keep all Node-only imports out of this graph |
| `src/highlight.ts` | TypeScript 7 isolated-declaration probe found two inferred default parameters | Add the two explicit parameter annotations required by `isolatedDeclarations`; avoid broader declaration-driven refactoring |
| `tsdown.config.ts` (planned) | Separate runtime targets and declaration/package validation | Define neutral library and Node CLI configurations with one clean output directory and no cross-platform shared chunk |
| `test/*.test.ts` | Eight suites and 124 tests currently use `bun:test`; CLI suite uses `Bun.spawnSync` | Move adapters/imports to Vitest and Node while preserving observable assertions |
| `test/package-candidate.ts` | Validates actual package files, installed API/types/bin, Worker size/runtime, and cleanup | Replace Bun packaging/execution with npm/Node; accept an optional existing tarball so release validation can use exact bytes |
| `test/worker/*` | Package-root Worker smoke without `nodejs_compat` | Remains the authority for runtime/type bundling of the Worker fixture; do not add Node compatibility flags |
| `.oxfmtrc.json` (planned) | Repository formatter policy | Format owned source/tests/config/docs; ignore generated, historical, agent, lock, and vendored content |
| `.oxlintrc.json` (planned) | Syntax, type-aware, and anti-slop policy | Lint only first-party code, load the vendored plugin, keep `tsc` independent, and keep Worker validation appropriately scoped |
| `tools/oxlint/anti-slop/**` (planned) | Vendored third-party lint plugin | Copy unchanged from the reviewed revision, include upstream license/provenance, load but do not lint/format/remediate it |
| `README.md`, `AGENTS.md`, `PROJECT.md` | Active Bun-first user and contributor guidance | Document Node/npm, TS7/tsdown/Oxc commands, and retain project simplicity/Worker requirements |
| `.github/workflows/ci.yml` (planned) | No CI currently exists | Add bounded Node 22.18 and 24 checks; run the heavy candidate once on Linux at the minimum version |
| TypeScript 7 announcement: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ | Native compiler and missing 7.0 programmatic API | Use CLI typechecking and Oxc declaration generation; avoid tools that require the legacy API |
| tsdown configuration/docs: https://tsdown.dev/options/config-file, https://tsdown.dev/options/platform, https://tsdown.dev/options/dts, https://tsdown.dev/options/dependencies, https://tsdown.dev/options/lint | Multiple configurations, neutral platform, Oxc declarations, default dependency externalization, package validators | Supports the two-entry build and release validation without raw Vite |
| Oxlint docs: https://oxc.rs/docs/guide/usage/linter/type-aware, https://oxc.rs/docs/guide/usage/linter/js-plugins | `oxlint-tsgolint` type-aware mode and alpha JS-plugin API | Exact-pin matching Oxlint/plugin versions; keep compiler checking separate and upgrades deliberate |
| Oxfmt config docs: https://oxc.rs/docs/guide/usage/formatter/config | Formatter defaults, ignores, sorting controls | Use explicit conservative config and exclude vendored/generated material |
| Anti-slop commit: https://github.com/dmmulroy/anti-slop/commit/6d538555cb151d4121ed51a27db81890eacf8ae9 | Reviewed generic rules and installer guidance | Vendor that revision, matching `oxlint`/`@oxlint/plugins` `1.78.0`, and initially enable every generic rule |
| npm registry metadata for `mdtoemail@0.2.0` | Published Bun-only release now exists | Set the migration release to `0.3.0` |

### Pre-implementation evidence

- `typescript@7.0.2` `tsc -p tsconfig.json` passes the current checkout unchanged.
- A TypeScript 7 `isolatedDeclarations` emit probe found only two errors, both missing explicit `number` annotations for defaulted `tabWidth` parameters in `src/highlight.ts`; no public-API redesign is indicated.
- Current exact versions verified from npm: TypeScript `7.0.2`, tsdown `0.22.14`, Vitest `4.1.10`, Oxlint and `@oxlint/plugins` `1.78.0`, `oxlint-tsgolint` `7.0.2001`, Oxfmt `0.63.0`, `smol-toml` `1.8.0`, publint `0.3.23`, and `@arethetypeswrong/core` `0.18.5`.
- tsdown `0.22.14` accepts TypeScript `^7.0.0`; when `isolatedDeclarations` is enabled it uses `oxc-transform` for declaration output. Its built-in shebang plugin restores executable permissions on emitted entries.

## Tasks

#### T1 — Replace Bun runtime, package, build, and test foundations atomically

- **Change:**
  - Update `AGENTS.md` at the start of the task from Bun-first implementation guidance to the approved Node/npm, TypeScript 7, tsdown, Vitest, Oxlint, and Oxfmt direction while retaining the simplicity, TOML, no-server, minimal-dependency, and conservative email HTML rules.
  - Set package version `0.3.0`, `engines.node: ">=22.18.0"`, Node/npm keywords and scripts, and remove the Bun engine, Bun package-manager declaration, Bun scripts, `@types/bun`, and `bun.lock`.
  - Add exact runtime dependency `smol-toml@1.8.0` and exact foundation dependencies `typescript@7.0.2`, `@types/node@22.20.1`, `tsdown@0.22.14`, `vitest@4.1.10`, `publint@0.3.23`, and `@arethetypeswrong/core@0.18.5`; generate and commit `package-lock.json` through npm.
  - Provide `dev`, `test`, `typecheck`, `build`, `prepack`, and later-completed `check` scripts using `node`, `vitest`, `tsc`, and `tsdown`; use the npm bundled with each supported Node release rather than pinning an npm patch version.
  - Replace the Bun CLI shebang with `#!/usr/bin/env node`; replace `Bun.file`/`Bun.write` with UTF-8 `node:fs/promises` reads/writes; preserve read/write error prefixes, strict-before-write behavior, output derivation, diagnostics, and exit codes.
  - Import `package.json` with a JSON import attribute so TypeScript knows the version shape, Node can execute the source, and tsdown can inline the local JSON into the CLI bundle without a safety cast or runtime `createRequire` adapter.
  - Replace `Bun.TOML.parse` with `smol-toml`; preserve implicit `mdtoemail.toml` `ENOENT`, explicit config failures, theme resolution, theme/config precedence, unknown-key behavior, and the stable `Invalid config:` / `Invalid theme:` prefixes.
  - Change first-party relative imports to explicit `.ts` specifiers so direct Node source execution remains valid; let tsdown eliminate internal relative imports from shipped entry bundles.
  - Replace `bun:test` imports in all eight `test/*.test.ts` suites with explicit Vitest imports without rewriting assertions, snapshots, fixtures, or test names. Add a Vitest config only if discovery, timeouts, or isolation demonstrably require one.
  - Replace `Bun.spawnSync` in `test/cli.test.ts` with `node:child_process.spawnSync`, execute `src/cli.ts` with `process.execPath`, and expose only the exit/stdout/stderr result shape existing assertions need. Keep tests within a file non-concurrent and preserve temporary-directory, cwd, and console restoration.
  - Add focused CLI regression cases for missing input, extra input, nonexistent input/read failure, output-to-directory/write failure, equal input/output paths, and actual default output derivation without `--output`; assert nonzero exits, stable prefixes, and no unintended file writes where applicable.
  - Add focused config-loader cases for the complete checked-in `mdtoemail.example.toml`, malformed project TOML with `Invalid config:`, malformed theme TOML with `Invalid theme:`, and an explicitly requested missing config file. Assert mdtoemail-owned prefixes and behavior, not parser-vendor wording.
  - Update `tsconfig.json` for TypeScript 7 with explicit ES2022/ESNext/bundler resolution, Node types, strictness, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `isolatedDeclarations`, declarations enabled for analysis, and `noEmit`; retain `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noUncheckedSideEffectImports`.
  - Add only the two explicit `number` annotations already proven necessary in `src/highlight.ts`; do not add declaration-motivated annotations elsewhere without a compiler error.
  - Add `tsdown.config.ts` as an array of two configurations sharing `dist`: neutral ES2022 `src/index.ts` with ESM declarations/maps, and Node `src/cli.ts` with ESM/no declarations. Enable source maps, external runtime dependencies, no minification, `failOnWarn`, publint at error level, and attw with `esm-only` profile/error level on one package configuration.
  - Use tsdown's multi-config coordinator as designed in `0.22.14`: declare clean output on one configuration, relying on its consolidated pre-build `cleanOutDir(configs)`, and enable package validators on one configuration, relying on post-build package validation after all configurations complete. Verify this behavior against the pinned source and emitted artifacts; do not add a build wrapper unless the pinned behavior is disproven.
  - Keep manifest exports/bin explicit and remove `tsconfig.build.json` after confirming no script/tool references it. Do not add Vite, Vite+, `tsx`, `rimraf`, a second TypeScript runner, or CommonJS output.
- **Starts at:** `AGENTS.md`, `package.json`, `bun.lock`, `tsconfig.json`, `tsconfig.build.json`, `src/cli.ts`, `src/config-loader.ts`, `src/highlight.ts`, relative imports under `src/`, all eight `test/*.test.ts`; add `tsdown.config.ts`, `package-lock.json`, and `vitest.config.ts` only if required.
- **Depends on:** None.
- **Tests:** The migrated Vitest suite remains the unit/integration oracle for compiler, renderer, sanitizer, config, diagnostics, and CLI behavior. New CLI cases directly protect the filesystem/error branches changed by the Node adapter; new TOML cases protect parser compatibility and both error-label boundaries. Built-artifact smokes protect the current Node import/CLI failures and library/CLI graph separation. Existing pre-migration Node failures provide sensitivity evidence without a temporary production mutation.
- **Verify:**
  - Run `npm ci`; expect a clean install from `package-lock.json` with no Bun package/type requirement.
  - Run `npm run typecheck`; expect TypeScript `7.0.2`, no Bun globals/types, and no `isolatedDeclarations` errors across source, tests, and root tooling.
  - Run `npm test`; expect all 124 existing tests plus the 10 focused CLI/TOML cases (at least 134 total), no skips, and no open-handle warning.
  - Run `npm test -- test/cli.test.ts test/config.test.ts test/library.test.ts`; expect CLI success/failure I/O, TOML labels/precedence, global restoration, and library parity to pass in isolation.
  - Run `npm run build`; expect `dist/index.js`, `dist/index.d.ts`, declaration/source maps, and executable `dist/cli.js`; expect both entry outputs to coexist and publint/attw to run only after the complete output, with no errors.
  - Run `node -e 'import("./dist/index.js").then(async ({compileMarkdownEmail}) => { const r = await compileMarkdownEmail("# Node"); if (!r.html.includes(">Node</h1>")) process.exit(1) })'`; expect exit 0, proving the current `ERR_MODULE_NOT_FOUND` regression is gone.
  - Run `node dist/cli.js --version`; expect `0.3.0`.
  - Convert a temporary Markdown file through `node src/cli.ts` and `node dist/cli.js` with the same temporary TOML config; expect both to produce the same HTML and configured theme value.
  - Run `grep -RInE 'bun:test|Bun\.spawnSync|\bBun\.' src test`; expect no matches. Search `dist/index.js` and its imported local chunks, if any, for `node:` and CLI/config-loader symbols; expect none.
- **Risk/recovery:** TypeScript 7's missing programmatic API makes declaration generation the main tool risk. Keep `isolatedDeclarations` and the Oxc path; if tsdown falls back to TypeScript's API or emits incorrect declarations, stop and diagnose rather than disabling declaration checks. If Vitest needs a timeout/isolation override, scope it to the proven suite. If tsdown's verified multi-config lifecycle differs in practice, use the smallest explicit sequential orchestration without another dependency. If entries share a Node-bearing chunk, emit independent bundles rather than adding Worker polyfills.

#### T2 — Rebuild the package-candidate flow around one bounded npm tarball run

- **Change:**
  - Rewrite `test/package-candidate.ts` to run directly under Node 22.18 TypeScript stripping: replace `import.meta.dir`, Bun package commands, `Bun.spawnSync`, Bun fixture names, and JSON imports without attributes with standard Node APIs and npm commands.
  - Allocate one run-scoped temporary root and place pack, Node, Worker, and dry-run subdirectories beneath it so cleanup has one ownership boundary.
  - Default to one `npm pack --json --pack-destination <temp>` invocation and let `prepack` build the package; robustly parse npm lifecycle output and capture the exact tarball path, version, integrity, and file inventory.
  - Accept one optional existing tarball path. When present, skip packing and validate/install that exact file; this is the release path used by T5, not a parallel test implementation.
  - Inspect npm's pack metadata plus the packed/installed manifest. Require `dist/index.js`, `dist/index.d.ts`, maps, executable `dist/cli.js`, README, license, examples, and TOML example; reject `src/`, Bun engines/shebangs/APIs, and unrelated historical/tooling/vendor files.
  - Install the same tarball with npm into clean Node and Worker fixtures. In the Node fixture, import the package from plain `.mjs`, compile representative GFM plus an unsafe link, type-check a NodeNext consumer of every public type/export, invoke the installed bin for `--version`, and perform one installed-bin conversion with explicit TOML config.
  - Give every build, pack, npm install, typecheck, installed-bin/conversion, and Wrangler dry-run subprocess an operation-appropriate hard timeout and surface timeout/signal diagnostics; retain separate bounded Worker readiness and request timeouts.
  - Make Wrangler shutdown race-safe by handling already-exited children, sending graceful termination, escalating after a bounded wait, awaiting confirmed exit, and failing cleanup if termination cannot be confirmed.
  - Register `SIGINT`/`SIGTERM` handlers that enter the same single-owned idempotent cleanup path, await child shutdown and temporary-root removal, then restore/propagate the terminating exit semantics. Avoid duplicate top-level cleanup calls.
  - Preserve Wrangler upload-size parsing/budget, default and highlighted workerd requests, and the absence of `nodejs_compat`. Assert the installed library entry has no Node built-in dependency and that its package-root Worker import succeeds; leave behavioral permutations to Vitest.
- **Starts at:** `test/package-candidate.ts`, `test/worker/worker.ts`, `test/worker/wrangler.jsonc`, `package.json`.
- **Depends on:** T1.
- **Tests:** The candidate is the package-level integration/contract test for actual npm bytes: Node ESM runtime, public declarations, npm bin, config filesystem behavior, manifest/inventory, workerd portability, bundle size, bounded subprocesses, interruption-safe child/temp cleanup, and exact release bytes.
- **Verify:**
  - Run `npm run test:candidate`; expect one tarball, successful clean npm installs, Node import/types/bin/config checks, clean Wrangler dry-run, both Worker responses, recorded gzip size below 10 MiB, and `candidate ok`.
  - Run the candidate once with its just-created tarball supplied as the optional argument; expect the same checks and no second pack. Preserve one tarball outside cleanup only for this bounded sensitivity check, then remove it.
  - Exercise the candidate's bounded failure path with an intentionally expired subprocess timeout or controlled early Wrangler exit in a disposable run; expect a nonzero result with timeout/exit diagnostics, confirmed child termination, and automatic removal of the run root. Restore normal timeout inputs afterward.
  - Send `SIGTERM` to a disposable candidate run after Wrangler starts; expect the handler to terminate Wrangler, remove the run root, and exit nonzero without retaining processes/files.
  - Search the packed inventory/manifest; expect version `0.3.0`, Node engine, `dist` exports/bin, and no `src/`, Bun engine, Bun shebang, vendored lint plugin, or Sätteri artifact.
- **Risk/recovery:** npm lifecycle logs may appear before `--json`; parse the bounded JSON result rather than assuming stdout is pure JSON. Keep cleanup idempotent and single-owned, and treat cleanup failure as candidate failure. Do not add a general process manager or duplicate Node/Worker packaging flows.

#### T3 — Add Oxfmt, Oxlint type-aware linting, and anti-slop through a measure-first cleanup

- **Change:**
  - Add exact dev dependencies `oxfmt@0.63.0`, `oxlint@1.78.0`, `@oxlint/plugins@1.78.0`, and `oxlint-tsgolint@7.0.2001`; add `format`, `format:check`, and `lint` scripts.
  - Add `.oxfmtrc.json` with explicit 100-column/double-quote/semicolon/two-space settings. Initially disable import sorting and package-field sorting. Ignore `dist/**`, `node_modules/**`, `package-lock.json`, `.plans/**`, `.reviews/**`, `reports/**`, generated example HTML, agent/tool state directories, and `tools/oxlint/anti-slop/**`.
  - Vendor the anti-slop skill assets unchanged under `tools/oxlint/anti-slop/` from commit `6d538555cb151d4121ed51a27db81890eacf8ae9`; include the upstream MIT license and a short provenance record with repository/commit. Do not configure the Effect entry.
  - Add `.oxlintrc.json` loading `./tools/oxlint/anti-slop/index.ts`, matching the formatter/tooling ignores, and enabling all generic anti-slop rules at `error`: no chained assertions, conditional empty spreads, known-value widening, module mocking, object parameters, Reflect apply/get, runtime `typeof`, shape terms in symbol names, unknown parameters/returns/type aliases, unsafe dictionary types, widen-then-assert, and assertions without safety comments.
  - Enable Oxlint's built-in correctness coverage plus targeted type-aware rules for floating/misused promises, await-thenable, only-throw-error, unnecessary assertions, and other high-confidence TypeScript correctness rules supported by `oxlint-tsgolint`. Set `options.typeAware: true`; leave experimental `options.typeCheck` disabled because `tsc --noEmit` remains authoritative.
  - Scope type-aware lint to the root TypeScript project (`src`, root `test/*.ts`, and `tsdown.config.ts`). Run ordinary non-type-aware Oxlint plus Wrangler dry-run for `test/worker/worker.ts`, which is intentionally excluded from the Node tsconfig and is a package-consumer fixture.
  - Before changing first-party code for lint, run the complete configured lint once and summarize counts by rule and path in the implementation handoff. Do not lint or report findings from `node_modules`, `dist`, agent state, or the vendored plugin itself.
  - Apply Oxfmt to owned files in a formatter-only commit. Then resolve first-party lint findings with the smallest evidenced change, preferring inference, `as const`, `satisfies`, named contracts, and explicit trust-boundary parsing. Preserve config validation, HAST interoperability, test intent, diagnostics, and public API/output.
  - Do not add unsafe casts, mechanically launder values, broadly disable rules, edit the vendored plugin, or add a schema dependency simply to reach zero findings. If a generic rule systematically rejects a necessary config/error/HAST boundary and cannot be satisfied cleanly, stop with the measured examples and ask before weakening policy or changing architecture.
  - Add `check` as `format:check → lint → typecheck → test → build`; each stage must fail independently and preserve its diagnostics.
- **Starts at:** `package.json`, `package-lock.json`; add `.oxfmtrc.json`, `.oxlintrc.json`, `tools/oxlint/anti-slop/**`; first-party fixes may start wherever the measured run points under `src/**`, `test/*.ts`, `test/worker/worker.ts`, and `tsdown.config.ts`.
- **Depends on:** T1 and T2, so the measured baseline describes the intended Node/TS7 code rather than code scheduled for deletion.
- **Tests:** Formatter/linter commands are static quality gates, not behavioral substitutes. Every first-party lint fix must keep the narrow relevant Vitest suite green; config/error-boundary fixes use `test/config.test.ts`, AST/render fixes use the matching email/markdown/highlight/HTML suite, CLI/process fixes use `test/cli.test.ts` or the candidate, and Worker changes use the package candidate.
- **Verify:**
  - Run the initial `npm run lint` before remediation; expect nonzero only if first-party findings exist, and record exact counts/rules/paths without changing vendored/dependency files.
  - Run `npm run format`, inspect the formatter-only diff, then run `npm run format:check`; expect zero formatting changes pending and no vendored/generated/historical files touched.
  - Run `npm run lint`; expect exit 0 across the configured first-party scopes and no report originating from ignored third-party/generated paths.
  - Run `npm run typecheck && npm test && npm run build && npm run test:candidate`; expect all behavior/package/Worker gates to remain green after lint cleanup.
  - Review any `oxlint-disable` comments or rule severity changes; expect none added without explicit user approval and a concrete boundary rationale.
- **Risk/recovery:** Oxlint JS plugins are alpha and require matching versions; keep exact pins and upgrade them together. The number of anti-slop findings is intentionally unknown until the first run and is not itself a defect metric. If compliance would make first-party code less clear or change behavior, preserve the boundary and escalate with evidence rather than contorting the design.

#### T4 — Add bounded CI and update active Node/toolchain documentation

- **Change:**
  - Add `.github/workflows/ci.yml` with one fast matrix on Node `22.18.0` and current Node 24 running `npm ci` and `npm run check`; run `npm run test:candidate` once on Linux/Node `22.18.0` after the fast gate.
  - Keep CI bounded: no publish credentials, automated release, coverage service, cache framework, broad OS matrix, or duplicate Worker candidate on every Node version.
  - Rewrite README installation/usage around `npx mdtoemail`, `npm install --global mdtoemail`, and `npm install mdtoemail`; state Node `>=22.18.0`, ESM-only library use, Cloudflare Worker compatibility, and the npm contributor commands.
  - Verify and refine the `AGENTS.md` policy established in T1 so its final commands match the implemented TypeScript 7, tsdown, Vitest, Oxlint, and Oxfmt setup; do not defer the architectural instruction change until this documentation task.
  - Update active runtime/tooling sections of `PROJECT.md`; do not rewrite historical `.plans/`, `.reviews/`, or reports. Remove active Bun references from source, tests, package metadata, README, AGENTS, and PROJECT.
  - Document that `tools/oxlint/anti-slop/**` is vendored third-party source excluded from local remediation and how to update it deliberately with matching Oxlint versions and provenance.
- **Starts at:** add `.github/workflows/ci.yml`; update `README.md`, `AGENTS.md`, `PROJECT.md`, `package.json`, and anti-slop provenance notice.
- **Depends on:** T3.
- **Tests:** The Node matrix protects the declared minimum and current LTS behavior. The single candidate job protects actual npm bytes and Worker compatibility. Documentation commands are exercised by the same scripts and candidate rather than by duplicative documentation tests.
- **Verify:**
  - Run `npm ci && npm run check && npm run test:candidate`; expect all local release gates green.
  - Run `grep -RInE '\bBun\b|bun:test|Bun\.|#!/usr/bin/env bun' src test package.json README.md AGENTS.md PROJECT.md tsconfig*.json`; expect no active Bun runtime/tooling references.
  - Inspect CI; expect exactly two fast Node versions and one Linux/minimum-Node candidate, all using npm and no publishing credentials.
  - Run the documented local install/dev/build/test/lint commands from a clean checkout; expect each command to match an actual package script and exit 0.
- **Risk/recovery:** Keep the support statement tied to tested runtime behavior, not build-tool engines alone. If Node 24 reveals a real behavioral divergence, fix/test it; do not remove the matrix cell or add a version-specific compatibility layer without evidence.

#### T5 — Validate, publish, and verify the exact `0.3.0` tarball

- **Change:**
  - Start from a clean, reviewed commit. Run all checks, then create one tarball with `npm pack --json --pack-destination <temp>`; record its path, size, shasum, and integrity.
  - Pass that exact tarball to `test/package-candidate.ts`; do not repack during final candidate validation.
  - Run `npm publish <tarball> --dry-run --access public`, inspect files/manifest/bin/engine/version, and install it into one additional clean temporary npm project for `npx --package=<tarball> mdtoemail --version` plus one file conversion without Bun on `PATH`.
  - Confirm `mdtoemail@0.3.0` is still unpublished immediately before release, then publish the exact validated tarball with `npm publish <tarball> --access public`.
  - Verify registry version, Node engine, bin, exports, and `dist.integrity` against the recorded tarball. Tag and release the exact source commit only after registry verification.
- **Starts at:** `package.json`, npm registry state, clean release checkout, operator npm authentication.
- **Depends on:** T4 and explicit release approval after dry-run inspection.
- **Tests:** Exact packed-artifact validation protects the irreversible publication boundary: installed Node API/types/bin/config behavior, Worker compatibility, file inventory, and integrity are proven on the same bytes submitted to npm.
- **Verify:**
  - Run `npm ci && npm run check`; expect all formatting, lint, TypeScript, Vitest, tsdown, publint, and attw gates green on a clean tree.
  - Run `npm pack --json --pack-destination <temp>` followed by `npm run test:candidate -- <tarball>`; expect exact-byte Node/types/bin/Worker success and no repack.
  - Run `npm publish <tarball> --dry-run --access public`; expect version `0.3.0`, Node engine, expected files/bin/exports, and no normalization warning.
  - Run `npm view mdtoemail@0.3.0 version engines bin exports dist.integrity --json` after publication; expect registry metadata and integrity to match the validated tarball.
- **Risk/recovery:** npm publication is irreversible. Stop if the tree is dirty, `0.3.0` already exists, integrity differs, any check is skipped, or the dry-run inventory differs from the candidate. Do not choose another version or package name silently.

## Final acceptance

- **Checks:** `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:candidate`, minimum/current-LTS CI, publint, attw, npm publish dry-run, exact-tarball clean install/npx smoke, Worker default/highlight smoke, and post-publish registry integrity all pass without skips.
- **End state:** Users need Node `>=22.18.0`, not Bun. `npx mdtoemail`, the installed CLI, direct Node ESM package import, and NodeNext declaration consumption work. TypeScript 7 checks source, tsdown emits independent neutral-library and Node-CLI bundles, TOML/output/diagnostics remain stable, and the package root still runs in workerd without Node compatibility flags. First-party source is Oxfmt-clean and passes type-aware Oxlint plus the measured generic anti-slop rules; vendored/dependency source is untouched and excluded. npm is the sole documented package manager and `0.3.0` is the published migration release.
- **Deferrals:** CommonJS, Vite+, automated publishing, dependency/source linting, import/package sorting, a broad platform matrix, and any anti-slop rule customization remain deferred until a measured need exists.
- **Implementation checkpoint:** The only intentionally unknown outcome is the first anti-slop run. It does not block starting implementation. It does block silently weakening rules or adding architecture: if clean first-party fixes are not proportionate, return the exact measured examples for user decision.
