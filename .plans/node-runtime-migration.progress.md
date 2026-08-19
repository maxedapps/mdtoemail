# Implementation Progress

- **Template loaded from:** `implement-plan/assets/progress-tracker-template.md`
- **Plan:** `.plans/node-runtime-migration.md`
- **Status:** `In progress`
- **Updated:** 2026-08-18

`Complete` = all rows `Verified` or user-approved `Descoped` + validation passed + final implementation review `Clear` + changes-report candidate `Clear` when a report is produced + nothing material open. Parent = sole tracker writer.

## Tasks / subtasks

Status: `Pending` | `In progress` | `Blocked` | `Verified` | `Descoped`

| ID | Plan ref / requirement | Deps | Status | Acceptance check | Evidence |
|---|---|---|---|---|---|
| T1.1 | Update AGENTS policy and package metadata/scripts/dependencies for Node >=22.18, npm, version 0.3.0; remove Bun lock/types/metadata | — | Verified | `npm ci`; metadata inspection; Bun search | Exact pins/lock/Node metadata verified; scoped Bun grep clean |
| T1.2 | Replace Bun CLI/fs/process/version handling with Node while preserving behavior | T1.1 | Verified | focused CLI tests and source/built CLI smokes | 134 suite + 61 focused tests; parity smoke passed |
| T1.3 | Replace Bun TOML loading with smol-toml while preserving precedence and stable error prefixes | T1.1 | Verified | focused config tests | Config regressions and full suite passed |
| T1.4 | Convert first-party imports and eight suites to Node/Vitest; add focused CLI/TOML regressions | T1.1-T1.3 | Verified | >=134 tests; focused isolation command | 8 files/134 tests; focused 3 files/61 tests; no skips |
| T1.5 | Configure TS 7 strict no-emit/isolated declarations; annotate only proven highlight parameters; remove build tsconfig | T1.1 | Verified | `npm run typecheck` | TS 7.0.2 typecheck passed; two planned annotations only |
| T1.6 | Add separate neutral-library and Node-CLI tsdown builds with declarations/maps/shebang/validators and explicit manifest | T1.1,T1.5 | Verified | build artifact and graph inspection; publint/attw | Build passed; 6 artifacts; executable CLI; publint/attw clean |
| T1.7 | Prove source/built CLI parity, Node library import, and absence of Bun/Node leakage | T1.2-T1.6 | Verified | manual smokes and grep | Node import/version/parity/theme/neutral graph smokes passed |
| T2.1 | Rewrite package candidate for Node/npm, exact optional tarball, one run-owned temp root, inventory/manifest checks | T1 | Verified | candidate default and supplied-tarball runs | Default + exact tarball passed; 37 files; integrity matched; no repack |
| T2.2 | Add bounded subprocess/readiness/request timeouts and race-safe Wrangler/signal cleanup | T2.1 | Verified | controlled timeout/early-exit/SIGTERM probes | Timeout and active/prelaunch SIGTERM probes passed; review race fixed and re-review Clear |
| T2.3 | Validate exact installed Node API/types/bin/config and Worker package-root import/size without nodejs_compat | T2.1,T2.2 | Verified | `npm run test:candidate` | Node/types/bin/TOML + Worker default/highlight passed; gzip 300800 B |
| T3.1 | Add exact Oxfmt/Oxlint/plugin/type-aware dependencies and conservative configs/ignores | T2 | Verified | config inspection and commands | Exact deps/configs/scripts installed; Worker lint/dry-run passed |
| T3.2 | Vendor anti-slop generic plugin unchanged at reviewed commit with license/provenance; enable all 15 rules | T3.1 | Verified | provenance/diff/config inspection | 21 assets + license byte-identical; all 15 error; Effect not loaded |
| T3.3 | Run unmodified measure-first lint and record first-party counts by rule/path | T3.1,T3.2 | Verified | captured baseline | 135 errors: 128 anti-slop + 7 built-in; counts recorded in loop/decision |
| T3.4 | Apply formatter-only rewrite, then minimal reasonable first-party lint cleanup without disables/vendor edits/behavior drift | T3.3 | Verified | format/lint + focused tests + diff inspection | Oxfmt applied; 44 reasonable findings fixed; exactly 4 approved rules off; 11 remain error; review Clear |
| T3.5 | Add ordered `check` gate and prove format/lint/typecheck/test/build/candidate | T3.4 | Verified | clean `npm run check`; candidate | Worker dry-run moved after sole build; dist-absent checks passed Node 22.18/24; focused review Clear |

| T4.1 | Add bounded Node 22.18/current-24 CI fast matrix plus one minimum-version candidate job | T3 | Verified | workflow inspection | Exactly 2 fast cells + 1 minimum candidate; no credentials/cache/coverage/OS expansion |
| T4.2 | Update README/AGENTS/PROJECT and vendor update guidance for Node/npm/TS7/tsdown/Vitest/Oxc/Worker | T3 | Verified | command and active-Bun-reference checks | Active docs accurate; stale Sätteri finding fixed; focused re-review Clear |
| T4.3 | Clean-check documented commands and full local release gates | T4.1,T4.2 | Verified | clean checkout `npm ci && npm run check && npm run test:candidate` | CI root cause fixed; dist-absent checks passed on both configured Node versions; candidate passed |
| T5.1 | From reviewed state, create one 0.3.0 tarball; record path/size/shasum/integrity; validate exact bytes | T4 | Pending | pack metadata + candidate exact-tarball run | Prior tarball invalidated and removed after CI defect; must regenerate after fix |
| T5.2 | Dry-run publish and additional clean npx/conversion smoke without Bun on PATH | T5.1 | Pending | npm dry-run and temp install smoke | Prior dry-run invalidated by source fix |
| T5.3 | Confirm 0.3.0 unpublished and obtain explicit release approval | T5.2 | Pending | registry query + user approval | |
| T5.4 | Publish exact tarball, verify registry integrity/metadata, then tag/release exact source commit | T5.3 | Pending | registry integrity and VCS release evidence | |
| F1 | Reread plan, diff hygiene, final full checks, independent implementation review and proportionate decomplex audit | T1-T5 | Pending | Clear reviews and validation evidence | |
| F2 | Generate/QA changes report and obtain fresh independent candidate review | F1 | Pending | report candidate `Clear` | |
| F3 | Clean workflow-owned runtime/process/temp state and report retained resources | F2 | Pending | cleanup evidence | |

## Loop log

| ID | Owner | Worktree / isolation | Checks | Review | Cleanup |
|---|---|---|---|---|---|
| T1 | Pi worker + parent | Shared checkout, sequential | npm ci; typecheck; 134 tests; 61 focused; build; manual smokes | Fresh read-only T1 review: Clear | Runtime cleaned |
| T2 | Pi worker + parent | Shared checkout, sequential | default/exact candidate; timeout; active/prelaunch SIGTERM; typecheck | Finding: signal cleanup race; Fix now; focused re-review Clear | Runtime cleaned |
| T3 | Pi workers + parent | Shared checkout, sequential | measured lint; format/lint/typecheck/134 tests/build/candidate/check; vendor checksum | User-approved 4-rule disposition; fresh T3 review Clear | Runtime cleaned |
| T4 | Pi worker + parent | Shared checkout, sequential | clean install/check/candidate; docs/CI/Bun-reference inspection | Finding: stale active Sätteri guidance; Fix now; focused re-review Clear | Runtime cleaned |
| pre-release | Fresh Pi reviewer + parent | Read-only shared checkout | Fresh npm ci/check/candidate evidence | Full T1-T4/T5-readiness review Clear; decomplex audit no findings | Runtime cleaned |
| CI fix | Pi worker + parent | Shared checkout, sequential | Reproduced without dist; clean checks Node 22.18/24; candidate | Focused independent review Clear | Runtime cleanup pending |

## Reviews

| Checkpoint | Reviewer | Findings | Disposition | Closure |
|---|---|---|---|---|
| pre-release T1-T4 implementation review | Fresh Pi scout | No material findings; T5 readiness Clear | Validate | Clear |
| final implementation review | | | Fix now / Validate / Reject / Ask user / Block | Pending |
| decomplex audit | Parent using decomplex audit contract | No potential complexity findings | Validate | Clear — `.reviews/node-runtime-migration-implementation-decomplex.md` |
| changes-report candidate | | | Fix now / Validate / Reject / Ask user / Block | Pending |

## Decisions / deviations

| Item | Need / change | Evidence | Status |
|---|---|---|---|
| Release gate | T5 requires explicit approval after dry-run before irreversible publish | Plan T5 dependency and recovery language | Pending |
| Anti-slop policy | Initial unchanged run found 135 errors: 37 runtime-typeof, 27 unsafe-dictionary, 25 unknown-parameter, 21 safety-comment, 10 conditional-spread, 3 chained assertion, 3 known widening, 2 unknown-return, plus 7 built-in. Fix all reasonable findings; ignore only systematic boundary-incompatible categories rather than redesign/launder types. | Measured `npm run lint`; user: “fix reasonable warnings… others we can ignore” | Approved |
| CI clean-build ordering | `npm run check` ran Wrangler package-root dry-run before `dist` existed. Local runs falsely passed because ignored `dist/**` survived `npm ci`; GitHub Node 24 failed, fail-fast cancelled 22, candidate skipped. Worker Oxlint remains in lint; package-root Wrangler dry-run now runs after the sole build. | Actions run 32160510348; clean reproducer; clean Node 22.18/24 checks; focused review | Fixed; prior release tarball removed |
| Improve-skills | Core instructions require it after skill use, but no active `improve-skills` skill is installed/listed; a backup copy is not treated as active tooling | Skill catalog + filesystem lookup | Recorded |
