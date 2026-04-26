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

## Commands

```bash
npm run sniffer -- discover --repo ../web
npm run sniffer -- crawl --url http://localhost:3000
npm run sniffer -- audit --repo ../web --url http://localhost:3000
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

Use Codex mode only when configured:

```bash
export SNIFFER_AGENT=codex
export SNIFFER_CODEX_COMMAND="codex"
npm run sniffer -- apply-fix \
  --issue <issue_id> \
  --report reports/sniffer/latest/latest_report.json \
  --agent codex
```

If `SNIFFER_CODEX_COMMAND` is missing, Sniffer prints clear instructions and does not run Codex.

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
