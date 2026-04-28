# Sniffer

Sniffer is a context-aware UI QA agent. It is designed to inspect the source first, infer what the UI is supposed to expose, crawl the running app with Playwright, generate E2E tests, and report likely real UI bugs with evidence.

It is not a dumb crawler. The intended flow is:

1. Deterministic source discovery.
2. Optional LLM semantic interpretation.
3. Playwright runtime execution.
4. Evidence-backed issue classification and reports.

Sniffer does not perform destructive actions by default.

## Install

```bash
npm install
npm run build
```

## Sniffer Dashboard UI

Sniffer includes a local-only dashboard for launching audits, polling run status, and reading reports without opening JSON files by hand.

Build the UI and start the local API/static server:

```bash
npm install
npm --prefix ui install
npm run ui:build
npm run ui:server
```

Then open:

```text
http://127.0.0.1:4877
```

For UI development, run the API server and Vite dev server in separate terminals:

```bash
npm run ui:server
npm --prefix ui run dev
```

The Vite dashboard runs at `http://127.0.0.1:4878` and proxies `/api` to the local Sniffer server.

The dashboard provides:

- Run launcher for repo path, app URL, scenario mode, critic mode, UX critic, intent mode, provider, product goal, max iterations, and consistency checks.
- Story-first report navigation: Summary, Run Timeline, Scenarios, Crawl Path, Workflow Evidence, Issues, Fix Packets, Screenshots, Graph Explorer, and Raw JSON.
- Live run status through polling, with the current phase and recent logs shown in the Run Timeline view.
- Run Timeline phase cards for source discovery, runtime crawl, scenario execution, critics, product intent analysis, issue grouping, and fix packet generation.
- Scenario detail replay with prerequisites, step/assertion evidence, status chips, and inline screenshot previews.
- Crawl Path replay showing visited URLs/hashes, visible controls grouped by kind, safe actions attempted, repeated unchanged actions, screenshots, console errors, and network failures.
- Workflow Evidence view connecting source intent, source files, expected actions, runtime verification, related API calls, scenarios, critic decisions, and issues.
- Scoped Discovery Graph explorer with pan/zoom, minimap, controls, search, filters, legend, and node detail panels. It defaults to a crawl graph and supports Workflow graph, Issue graph, Crawl graph, Source intent graph, and Full graph (advanced) modes.
- Report summary cards, issue groups, issue detail, fix prompt copy actions, and issue verification launch.
- Fix packet list/detail view.
- Screenshot/evidence gallery.
- Settings view for LLM/agent configured status.
- A lightweight inline SVG golden retriever mascot that animates while Sniffer is running.

The UI never receives API keys. It only displays configured/unconfigured status, model name, and API style as reported by the local Node server. The server shells out to existing Sniffer CLI commands and captures stdout/stderr. It prevents concurrent audit runs by default and does not auto-apply fixes.

## Commands

```bash
npm run sniffer -- discover --repo ../web
npm run sniffer -- crawl --url http://localhost:3000
npm run sniffer -- audit --repo ../web --url http://localhost:3000
npm run sniffer -- audit --repo ../web --url http://localhost:3000 --scenario all --ux-critic deterministic
npm run sniffer -- audit --repo ../web --url http://localhost:3000 --scenario generate-plan-bundle
npm run sniffer -- audit --repo ../web --url http://localhost:3000 --critic-mode deterministic
npm run sniffer -- audit --repo ../web --url http://localhost:3000 --use-llm --provider mock --critic-mode llm --ux-critic llm
npm run sniffer -- generate-fixes --report reports/sniffer/latest/latest_report.json
npm run sniffer -- apply-fix --issue <issue_id> --report reports/sniffer/latest/latest_report.json --agent manual
npm run sniffer -- verify --issue <issue_id> --url http://localhost:3000 --report reports/sniffer/latest/latest_report.json
npm run sniffer -- repair-loop --repo ../web --url http://localhost:3000 --agent manual --max-iterations 3
npm run sniffer -- generate-tests --repo ../web --url http://localhost:3000
npm run sniffer -- run-tests
```

## Deterministic Audit

Start the target app separately, then run:

```bash
npm run sniffer -- audit --repo /path/to/ui-repo --url http://localhost:3000
```

This writes reports to:

```text
reports/sniffer/latest/
  source_graph.json
  app_intent.json
  crawl_graph.json
  latest_report.md
  latest_report.json
  fix_prompts.md
  fix_packets/
  repair_attempts/
  verification/
  screenshots/
  traces/
  generated_tests/
```

## LLM Mode

LLM mode is optional. Deterministic mode requires no API keys.

Create a local `.env` or export these variables:

```bash
export SNIFFER_LLM_BASE_URL=https://api.openai.com/v1
export SNIFFER_LLM_API_KEY=...
export SNIFFER_LLM_MODEL=...
export SNIFFER_LLM_API_STYLE=responses
```

Then run:

```bash
npm run sniffer -- audit --repo /path/to/ui-repo --url http://localhost:3000 --use-llm
```

Keys are used only by the Node CLI process. Sniffer never sends secrets to browser or client code.

## What Sniffer Collects

Source discovery reads `package.json`, detects likely framework and build tool, and scans source files for route, page, component, link, and form signals.

Runtime crawling opens the app with Playwright and collects:

- title and URL
- console errors
- network failures
- visible buttons, links, tabs, inputs, forms, and dialogs
- safe navigation and tab/dialog interactions
- visited states, state hashes, actions, and screenshots

## Workflow Critic

Sniffer runs candidate findings through a workflow critic before turning them into report issues or fix packets.

Default deterministic critic:

```bash
npm run sniffer -- audit \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --critic-mode deterministic
```

Mock LLM critic for local testing:

```bash
npm run sniffer -- audit \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --use-llm \
  --provider mock \
  --critic-mode llm
```

Provider flags:

- `--critic-mode deterministic|llm|auto`
- `--provider mock|openai|auto`
- `--use-llm`
- `--max-iterations`

The critic receives a focused context packet per finding: app identity, relevant source intent, runtime controls, screenshots paths, console/network errors, crawl actions, inferred app state, and the candidate finding. It returns structured JSON decisions such as `real_bug`, `crawler_needs_precondition`, `needs_more_crawling`, or `inconclusive`.

Conditional UI is deferred instead of reported when a precondition is missing. For example, missing Raw JSON before a plan bundle exists is treated as `crawler_needs_precondition` with `next_safe_action=generate_plan_bundle_with_sample_prompt`, not as a fix-packet-worthy bug. API/console 500s still report as real bugs.

## Scenario Packs And UX Audit

Sniffer can run safe workflow scenarios instead of only inspecting the first visible DOM state:

```bash
npm run sniffer -- audit \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --scenario all \
  --ux-critic deterministic
```

Built-in scenarios cover workspace-control style apps:

- create/select workspace
- add repo target
- validate local repo path
- refresh discovery
- refresh learning
- generate plan bundle
- review plan output tabs
- copy handoff prompt
- inspect raw JSON
- semantic enrichment toggle

Scenario execution only performs safe actions: selecting visible workspace/repo controls, opening modals, typing the sample prompt `Add OwnersPage (no actions yet)`, clicking generate/refresh-style actions, opening tabs, and clicking copy controls. It does not delete, reset, overwrite, or submit destructive actions.

Run a single scenario:

```bash
npm run sniffer -- audit \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --scenario generate-plan-bundle

npm run sniffer -- audit \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --scenario review-plan-output
```

Deterministic UX/accessibility checks look for:

- duplicate workspace names without disambiguation
- plus-only or unnamed buttons
- inputs/selects/textareas without accessible labels
- dialogs without labels
- duplicate DOM IDs
- jammed text such as `PetClinic local4/25/2026`
- horizontal overflow and long paths that do not wrap/truncate
- missing empty/loading states
- unclear primary actions
- disabled controls without guidance
- handoff/raw JSON output without copy affordances
- oversized plan output without tabs/collapsible sections

Optional LLM UX critique is separate from the workflow critic:

```bash
npm run sniffer -- audit \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --scenario all \
  --ux-critic llm \
  --provider openai \
  --use-llm
```

The UX critic receives compact context: app purpose, source workflow, visible controls, screenshot paths, DOM text summary, known state, and deterministic candidate UX issues. It returns structured JSON findings only. Screenshots are referenced by path; Sniffer does not send browser-side secrets.

Reports include separate sections for Functional/API issues, Workflow scenario failures, UX/layout issues, Accessibility issues, Deferred/conditional findings, LLM UX critic findings, and Fix packets.

## Issue Triage

Sniffer keeps detailed raw findings, but the user-facing report and fix packets are built from triaged repair groups.

The report summary includes:

- raw findings count
- triaged issues / repair groups count
- functional/API issues
- workflow scenario issues
- UX/layout issues
- accessibility issues
- raw findings appendix

Examples of deterministic repair groups:

- API endpoint failures
- Add repo workflow discoverability
- Plan output review/copy workflow
- Repository/workspace list readability
- Accessibility/copy affordance cleanup
- Loading/error state cleanup

If workflow verification found a control but a scenario later failed to locate it, Sniffer marks that raw scenario finding as inconclusive and notes that the scenario locator may be too strict. Those raw findings remain in the appendix but do not create standalone fix packets.

API evidence includes normalized endpoint patterns, method, status code, affected URLs, target ids when available, and response body text when Playwright can safely read it.

When `--critic-mode llm` or `--ux-critic llm` is enabled and the provider supports it, Sniffer can ask the LLM to group raw findings into repair themes. Deterministic grouping remains the fallback.

## Repair Loop

Sniffer can turn audit issues into structured fix packets, but it does not blindly edit code itself.

The loop is:

```text
audit -> issue diagnosis -> fix packet -> agent/manual fix -> verify -> fixed or still failing
```

Generate fix packets after an audit:

```bash
npm run sniffer -- generate-fixes --report reports/sniffer/latest/latest_report.json
```

This writes:

```text
reports/sniffer/latest/fix_packets/<issue_id>.md
reports/sniffer/latest/fix_packets/<issue_id>.json
```

Apply a fix manually:

```bash
npm run sniffer -- apply-fix \
  --issue <issue_id> \
  --report reports/sniffer/latest/latest_report.json \
  --agent manual
```

Manual mode prints the Codex-ready packet and does not modify files.

Use Codex mode only when configured. Sniffer writes the prompt to the repair attempt directory, runs Codex from `repair_root`, captures stdout/stderr, records git status/diff, and then you can run verification.

```bash
export SNIFFER_AGENT=codex
export SNIFFER_CODEX_COMMAND="codex"
export SNIFFER_CODEX_TIMEOUT_SECONDS=900
npm run sniffer -- apply-fix \
  --issue <issue_id> \
  --report reports/sniffer/latest/latest_report.json \
  --agent codex
```

You can also provide a command template:

```bash
export SNIFFER_CODEX_COMMAND="codex exec --prompt-file {prompt_file}"
```

If the command contains `{prompt_file}`, Sniffer replaces it with the generated prompt file path. Otherwise it pipes the prompt to stdin. If Codex is not installed or the command cannot be found, Sniffer prints clear instructions and does not run Codex.

Convenience scripts are also available:

```bash
npm run audit -- --repo /path/to/web --url http://localhost:3000 --critic-mode deterministic
npm run apply-fix -- --issue <issue_id> --report reports/sniffer/latest/latest_report.json --agent manual
npm run verify -- --issue <issue_id> --url http://localhost:3000 --report reports/sniffer/latest/latest_report.json
```

Verify an issue after a fix:

```bash
npm run sniffer -- verify \
  --issue <issue_id> \
  --url http://localhost:3000 \
  --report reports/sniffer/latest/latest_report.json
```

Run the full repair loop:

```bash
npm run sniffer -- repair-loop \
  --repo /path/to/ui-repo \
  --url http://localhost:3000 \
  --agent manual \
  --max-iterations 3 \
  --allow-destructive false
```

Repair attempts record git status before, git diff after, commands run, agent output, and verification results under `reports/sniffer/latest/repair_attempts/`.

Repair root and path safety:

- `repo_path` remains the scanned repo, such as `workspace-control/web`.
- `repair_root` is inferred from suspected files. If a fix needs `../server`, repair root becomes the parent project root.
- `allowed_paths` constrains modifications. For workspace-control learning-status issues, Sniffer allows `server/` and `web/src/`.
- Any new changed file outside `repair_root` or outside `allowed_paths` is blocked.

## Generated Tests

Generated Playwright specs are written to:

```text
reports/sniffer/latest/generated_tests/
```

They prefer accessible locators and stable user-visible assertions where possible.

## Safety Policy

Safe by default:

- click navigation, tabs, links
- open and close modals
- type temporary text into inputs
- click copy buttons

Unsafe unless explicitly allowed in a future implementation:

- delete, remove, reset, force, overwrite
- destructive repo operations
- permanent data mutation
- filesystem changes outside Sniffer reports and generated tests

Repair safety:

- fix packets include constraints and pass conditions
- destructive protected-data language is blocked unless `--allow-destructive true`
- manual mode never modifies files
- codex mode only runs when `SNIFFER_CODEX_COMMAND` is configured
- every repair attempt records git status, git diff, commands run, and verification results

## Limitations

Sniffer is an early deterministic-first implementation. It can miss authenticated flows, role-specific UI, data-dependent states, canvas-heavy interfaces, and workflows that require complex setup. LLM support is intentionally optional and should be treated as semantic assistance, not proof. Evidence-backed reports should still be reviewed by an engineer.
