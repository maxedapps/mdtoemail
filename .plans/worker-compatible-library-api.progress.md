# Implementation Progress

- **Template loaded from:** `implement-plan/assets/progress-tracker-template.md`
- **Plan:** `.plans/worker-compatible-library-api.md`
- **Status:** `Partial`
- **Updated:** 2026-08-18

`Complete` = all rows `Verified` or user-approved `Descoped` + validation passed + final implementation review `Clear` + changes-report candidate `Clear` when a report is produced + nothing material open. Keep report-review closure here / in the final handoff, never in the reviewed HTML.

Parent = sole tracker writer under concurrency.

## Tasks / subtasks

Status: `Pending` | `In progress` | `Blocked` | `Verified` | `Descoped`

| ID | Plan ref / requirement | Deps | Status | Acceptance check | Evidence |
|---|---|---|---|---|---|
| T2 | T2 — Separate portable config from Bun loading | — | Verified | `config.ts` has no Bun/Node imports; loader owns TOML/theme/cwd; schema/precedence/CLI unchanged; unsafe tokens rejected | Parent: `src/config.ts` grep clean; `src/config-loader.ts` owns I/O; `cli.ts` imports split; `bun test test/config.test.ts` 21 pass; typecheck clean |
| T2.1 | Keep Config, defaults, clone, merge, validation in portable `src/config.ts` | — | Verified | No `Bun`/`process`/`node:*`/`fs` in `src/config.ts`; `cloneConfig` + public resolved-config validator exist | Exported `cloneConfig` + `validateResolvedConfig`; grep clean |
| T2.2 | Move TOML/theme/cwd/path loading to `src/config-loader.ts` | T2.1 | Verified | CLI still loads TOML/themes; `test/config.test.ts` covers defaults, overrides, paths, unsafe tokens | Loader + existing TOML/theme tests pass |
| T2.3 | Library import/compile does not read config files | T2.2 | Verified | Proven by `test/library.test.ts` once T1 exists; portable modules do not import loader | library.test.ts cwd TOML ignored |
| T3 | T3 — Remove Bun/Node primitives from the compiler path | T2.1 | Verified | Escape helper matches current tests; `TextEncoder` sizing; explicit title; no portable Bun/Node refs | Parent: 32 targeted tests pass; typecheck clean; portable src has no Bun/Buffer/node imports |
| T3.1 | Project-owned HTML escaping replacing `Bun.escapeHTML` | — | Verified | `test/email.test.ts` escaping/wrapper cases pass | Local `escapeHtml` in `email.ts`; quote injection test passes |
| T3.2 | `TextEncoder` UTF-8 sizing replacing `Buffer.byteLength` | — | Verified | `test/diagnostics.test.ts` exact 85 KiB ASCII + multibyte boundary | `new TextEncoder().encode(html).byteLength` |
| T3.3 | `renderEmailDocument` takes explicit title; basename stays in CLI | T3.1 | Verified | CLI filename-title compatibility via `test/cli.test.ts`; callers updated | CLI passes `basename(input)` |
| T3.4 | Portable modules have no `Bun`/`process`/`Buffer`/`node:*`/fs | T3.1, T3.2, T3.3 | Verified | Source grep on portable `src/*`; after T7, dist grep | Source grep clean; dist grep deferred to T7 |
| T1 | T1 — Establish the portable public contract | T2, T3 | Verified | Root export compiles string → complete HTML + immutable diagnostics + frontmatter; no I/O | Parent: library 10 pass + typecheck; independent review Clear |
| T1.1 | Add `src/compiler.ts` validate/clone/orchestrate, no I/O or CLI policy | T2.1, T3.3 | Verified | Compiler clones/validates resolved config; wraps complete document; adds size diagnostic | src/compiler.ts |
| T1.2 | Add `src/index.ts` public exports | T1.1 | Verified | Exports `compileMarkdownEmail`, result/options types, `Config`, `Diagnostic`, default config | src/index.ts |
| T1.3 | Library contract tests | T1.2 | Verified | `bun test test/library.test.ts` + `bun run typecheck` | 10 pass; typecheck clean |
| T4 | T4 — Replace Sätteri with one portable Markdown/HAST engine | T3 | Verified | Exact-pinned unified pipeline; existing Markdown/email/safety contracts hold | Parent 124/125 pass + typecheck; T4/T5 review Clear |
| T4.1 | Remove `satteri`; pin unified/remark/rehype versions exactly | — | Verified | `package.json` exact pins; lockfile has no satteri/native artifacts | Exact pins; no satteri in lock |
| T4.2 | Rebuild GFM/frontmatter parse+serialize with source positions | T4.1 | Verified | YAML `---` and TOML `+++` `{ kind, value }`; disabled delimiters as Markdown | markdown tests + TOML case |
| T4.3 | Project-owned HAST sanitizer transform (allowlist, URLs, tasks, styles, tables, footnotes, raw HTML) | T4.1 | Verified | markdown/email/diagnostics/html-validity pass | parent 84 targeted + full suite |
| T5 | T5 — Port syntax highlighting onto the shared HAST pipeline | T4 | Verified | Opt-in async HAST transform; current highlight contracts hold | highlight + html-validity pass; review Clear |
| T5.1 | Async project-owned highlight transform after sanitization | T4.3 | Verified | No Sätteri plugin API; no init when disabled | highlightCodeHast early return |
| T5.2 | Preserve profiles, languages, limits, fallbacks, escaping | T5.1 | Verified | highlight + html-validity tests pass | parent verified |
| T6 | T6 — Rewire the CLI through the public compiler | T1, T5 | Verified | CLI uses compiler; no duplicate assembly; parity with library | parent 30 pass; CLI calls compileMarkdownEmail |
| T6.1 | CLI loads I/O/config, calls `compileMarkdownEmail`, prints diagnostics, strict-before-write | T1.2 | Verified | Existing `test/cli.test.ts` cases pass | src/cli.ts |
| T6.2 | CLI/library parity for same source, resolved config, basename title | T6.1 | Verified | Parity case in `test/library.test.ts` or `test/cli.test.ts` | test/cli.test.ts parity case |
| T7 | T7 — Build and package a supported library and CLI | T6 | Verified | `dist/index.js`, `dist/index.d.ts`, `dist/cli.js`; version `0.2.0` | Parent rebuilt; artifacts exist; portable dist grep clean; CLI --version 0.2.0 |
| T7.1 | Emit ESM + declarations + source maps + built CLI | T6 | Verified | `bun run build` produces the three artifacts | parent rebuild |
| T7.2 | Root `exports`/`types`/`bin`; importing root does not run CLI | T7.1 | Verified | `package.json` points at `dist`; files/README/scripts updated | exports/types/bin/files/README |
| T7.3 | Bump to `0.2.0`; exact-pin deps; remove Sätteri from lockfile | T4.1, T7.2 | Verified | Version and pins match plan | version 0.2.0; satteri already gone |
| T8 | T8 — Validate one packed candidate in Bun and workerd | T7 | Verified | One pack, Bun fixture, workerd default+highlight, cleanup | Parent `bun run test:candidate` pass; gzip 294.32 KiB; no leftover temp/process |
| T8.1 | Candidate script: build/pack once, inspect tarball, install into fixtures | T7 | Verified | `test/package-candidate.ts` + `bun run test:candidate` | parent rerun |
| T8.2 | Bun fixture: root import, compile, declarations, `--version` | T8.1 | Verified | Clean Bun success | compile ok; --version 0.2.0 |
| T8.3 | Worker runner: wrangler/workerd, default+highlight, dry-run size, always stop | T8.1 | Verified | Both responses; no `nodejs_compat`; no leftover process/temp | Ready on 127.0.0.1; compat 2026-08-03; cleanup confirmed |
| T9 | T9 — Release the prerequisite version | T8 | Pending | Human-owned publish of exact `0.2.0`; registry integrity | |
| T9.1 | Full validation ladder on exact `0.2.0` bytes | T8 | Verified | `bun test && bun run typecheck && bun run build && bun run test:candidate` | Parent: 125 pass, typecheck, build, candidate gzip 294.32 KiB |
| T9.2 | Human npm publish + tag + Emailed version/integrity | T9.1 | Pending | Requires owner credentials; do not publish from dirty checkout | Blocked on human npm auth |
| R1 | Final full-plan implementation review | T8 | Verified | Independent review `Clear` | explore 01a01424 Clear; T9.2 deferred |
| R2 | Changes-report candidate + independent candidate review | R1 | Verified | Candidate `Clear` | explore 01a0142f Clear; reports/worker-compatible-library-api-changes.html |

## Loop log (optional, keep brief)

| ID | Owner | Worktree / isolation | Checks | Review | Cleanup |
|---|---|---|---|---|---|
| T2 | worker 01a013f4 | shared checkout | parent: config tests 21 pass, typecheck, grep | parent inspect Clear | no extra resources |
| T3 | worker 01a013f7 | shared checkout | parent: 32 pass + typecheck | parent inspect Clear | no extra resources |

## Reviews

| Checkpoint | Reviewer | Findings | Disposition | Closure |
|---|---|---|---|---|
| T1 public contract | explore 01a013fc | none | parent: library tests already green | Clear |
| T4/T5 engine replacement | explore 01a0140e-9195 | none | parent 124/125 pass + typecheck | Clear |
| T7/T8 package + workerd | | | | |
| final implementation review | explore 01a01424 | none | parent T9.1 ladder + 124 tests after DEX-001 | Clear |
| changes-report candidate | explore 01a0142f | none | parent creator-QA + frozen evidence | Clear |

## Decisions / deviations

| Item | Need / change | Evidence | Status |
|---|---|---|---|
| T9 publish | Human credentialed action per plan; parent will not publish | Plan T9 risk/recovery | Pending user |
| DEX-001 leftover markdownFeatures | Delete unused Sätteri mapper + mapping test | decomplex audit; parent deleted; markdown+library tests pass | Fix now |
