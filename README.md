# Workspace-Control / StackPilot Prototype

## 1. What This Is

Workspace-Control, also called the StackPilot prototype in this repo, is a local-first cross-repo planning and control-plane experiment.

It is not trying to replace Claude, Copilot, Codex, Cursor, or IDE-native coding agents. Those tools are strong execution agents inside a repo or editing session. Workspace-Control is designed to sit above them as an evidence and planning layer:

- Repo intelligence layer
- Source graph and metadata layer
- Change planning layer
- Historical learning layer
- Repo-specific handoff prompt generator

The future product idea is simple:

1. Connect one or more repositories.
2. Discover their architecture and source surfaces.
3. Mine local Git history for repeatable change patterns.
4. Enter a feature request.
5. Generate a cross-repo plan with evidence, uncertainty, and likely files.
6. Generate repo-specific handoff prompts for coding agents to execute safely.

The current project is a Python CLI prototype. It is intentionally local, deterministic, read-only with respect to target repositories, and heavily evaluated through fixtures and replay reports.

## 2. Why This Exists

Modern coding agents are useful, but most of them reason from the current repo, current editor state, or current prompt. Teams often need a layer above that:

- Cross-repo impact analysis
- Persistent repo memory
- Architecture-aware planning
- Source-surface discovery
- Historical change-pattern learning
- Evaluation against real Git history
- Repo-specific prompts that make execution agents more effective

The original constraint was not to override existing Copilot or IDE tooling. Instead, Workspace-Control complements those tools by generating better context, better plans, and better scoped tasks before an execution agent starts editing code.

In other words: coding agents write code; Workspace-Control helps decide what work should be done, where, why, and with what caveats.

## 3. Core Philosophy

The prototype follows a few design principles:

- Deterministic first, LLM later.
- Source code is the truth.
- Stack metadata is useful, but source discovery should not depend on it.
- Framework docs and framework packs are priors, not truth.
- Recipes are evidence, not magic.
- Planner-native and recipe-assisted outputs must stay visible separately.
- Uncertainty and missing evidence should be preserved, not hidden.
- Target repos are read-only by default.
- The tool should never silently modify a target repo.
- Every meaningful behavior change should be measured through evals, replay, and debug reports.

This is why the CLI often returns explicit confidence, unsupported intents, missing evidence, matched recipes, and separate planner-only, recipe-only, and combined replay metrics.

## 4. Current Capabilities

The current prototype supports:

- Discovery targets and a registry
- A fully implemented `local_path` provider
- Stubbed/future `git_url` and `remote_agent` providers
- Framework detection from local project files
- Local framework packs for Spring Boot, React, and OpenAPI
- Architecture discovery
- Metadata-only mode for repos with only `stackpilot.yml`
- Mixed and source-discovered modes for partial or real source trees
- Inferred metadata mode when `stackpilot.yml` is absent
- Deterministic feature intent classification
- Concept grounding against source, metadata, inferred metadata, and graph evidence
- Source graph construction
- Graph explain and graph quality commands
- `analyze-feature`
- `plan-feature`
- `propose-changes`
- `generate-plan-bundle`
- Historical replay evaluation
- Replay matrix evaluation
- Tiered replay scoring
- Replay candidate discovery
- Replay debugging
- Repo-local learning loop
- Change recipe mining
- Recipe suggestions
- Recipe-assisted proposal output
- Baseline snapshot saving

The prototype currently has no web UI, database, auth system, background worker, hosted service, or LLM integration.

## 5. High-Level Architecture

The main planning pipeline is:

```text
discovery target
  -> provider/materializer
  -> framework detection
  -> framework pack loading
  -> architecture discovery
  -> source graph
  -> inferred repo profile
  -> concept grounding
  -> analyze-feature
  -> plan-feature
  -> propose-changes
  -> plan bundle / handoff prompts
```

The Git history sidecar is:

```text
git history
  -> replay candidate finder
  -> replay evaluator
  -> recipe miner
  -> repo-local learning state
  -> recipe suggestions
  -> recipe-assisted proposals
```

The two paths meet at proposal time. Planner-native output remains visible, recipe suggestions remain visible, and combined recommendations are produced as a separate layer.

This separation is deliberate. It lets us measure whether recipes help without letting them silently take over the planner.

## 6. Main Concepts

### Discovery Target

A discovery target describes where architecture evidence should come from.

A target can include:

- `id`
- `source_type`
- `locator`
- `ref`
- `hints`

Today, `local_path` is the fully implemented provider. It materializes an existing local path into a normalized workspace scan path.

`git_url` and `remote_agent` exist as provider stubs/future extension points. They are intentionally not used as live network or agent integrations yet.

### Metadata Modes

Repos can have different evidence modes:

- `metadata-only`: only metadata such as `stackpilot.yml` or hints are available.
- `mixed`: metadata plus partial source structure is available.
- `source-discovered`: real source/build/framework evidence is available.
- `inferred-metadata`: no explicit `stackpilot.yml` exists, so a deterministic profile is inferred from source discovery.

Metadata-only behavior is conservative. It avoids inventing concrete files unless metadata or conventions support them.

### Framework Packs

Framework packs are small, local, cached priors. They are not fetched from the internet at runtime.

Current packs include:

- `spring_boot`
- `react`
- `openapi`

Framework packs contain expected node kinds, common path roots, naming patterns, and validation command hints. They help discovery, but they do not override source evidence.

### Source Graph

The source graph normalizes source files and folders into typed nodes and typed edges.

A `GraphNode` can represent surfaces such as:

- `frontend_entrypoint`
- `app_shell`
- `landing_page`
- `page_component`
- `edit_surface`
- `form_component`
- `frontend_type`
- `public_html`
- `static_asset`
- `api_contract`
- `api_controller`
- `service_layer`
- `domain_model`
- `repository`
- `mapper`
- `migration`
- `event_publisher`
- `event_consumer`

A `GraphEdge` can represent relationships such as:

- `shares_domain_token`
- `imports_or_references`
- `renders_or_composes`
- `route_or_entrypoint_link`
- `api_handles_domain`
- `service_handles_domain`
- `model_persists_domain`
- `contract_mentions_domain`
- `likely_frontend_backend_link`

Example nodes:

- `client/src/components/App.tsx` -> `app_shell`
- `client/src/main.tsx` -> `frontend_entrypoint`
- `client/src/components/WelcomePage.tsx` -> `landing_page`
- `src/main/java/.../OwnerRestController.java` -> `api_controller`
- `src/main/java/.../Owner.java` -> `domain_model`

The graph is the scalable substrate. Instead of teaching the planner infinite one-off cases, the system tries to normalize source structure into reusable surfaces.

### Concept Grounding

Concept grounding extracts important request concepts and checks whether the repo actually supports them.

Grounding classifications include:

- `direct_match`
- `alias_match`
- `weak_match`
- `ungrounded`

For example, `phone number` may alias to `telephone` when the source uses `telephone`. If a prompt mentions `preferred language` in a repo with no language, locale, preference, or metadata evidence, the planner lowers confidence and records missing evidence.

Grounding helps prevent bluffing. It keeps the planner from confidently producing exact files for concepts that are not present in the repo.

### Change Recipes

Change recipes are repo-local patterns mined from Git history.

A recipe tracks evidence such as:

- Recipe type
- Trigger terms
- Changed node types
- Created node types
- Modified node types
- Changed path patterns
- Cochange patterns
- Example commits
- Structural confidence
- Planner effectiveness

Structural confidence means historical commits show a consistent pattern.

Planner effectiveness means the current planner/proposer predicts that pattern well in replay.

Those are intentionally separate. A recipe can be structurally strong even if the current planner is weak at predicting it. That makes the recipe useful future evidence instead of something to quarantine prematurely.

Recipe statuses include:

- `candidate`
- `active`
- `weak`
- `stale`
- `quarantined`

Recipe suggestions are separate evidence. They can assist proposals, but they should not silently override planner-native output.

### Plan Bundle

A Plan Bundle is the current user-facing artifact.

It is a UI-renderable JSON object with an optional Markdown export generated from the same structured data. It contains:

- Feature request
- Target and repo summaries
- Detected intents
- Ownership
- Recommended change set
- Matched recipes
- Source graph evidence
- Validation commands
- Risks and caveats
- Repo-specific handoff prompts

The Plan Bundle is the future UI contract. Markdown is a human-readable export, not the primary API.

## 7. Important Design Decisions

1. Keep Workspace-Control as a control plane, not a code editor.
2. Discovery should be source-agnostic.
3. Metadata and discovery are separate.
4. Framework packs are local/cached priors.
5. The source graph is the scalable substrate.
6. Do not teach infinite cases; normalize source into generic node types.
7. Git history creates repo-local recipes.
8. Recipe confidence is separate from planner effectiveness.
9. Recipe suggestions must not silently override planner output.
10. Replay evals must show planner-only, recipe-only, and combined metrics.
11. Plan Bundle JSON is the future UI contract.
12. Markdown is export/human-readable, not the primary API.

## 8. Commands

Run commands from the project root.

### Inventory

```bash
python3 main.py inventory
```

### Discovery Target Registration

```bash
python3 main.py register-discovery-target petclinic-react \
  --source-type local_path \
  --locator eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs
```

```bash
python3 main.py list-discovery-targets
```

### Architecture Discovery

```bash
python3 main.py discover-architecture --target-id petclinic-react
```

### Graph Discovery

```bash
python3 main.py discover-graph --target-id petclinic-react
```

```bash
python3 main.py discover-graph --target-id petclinic-react --format json
```

```bash
python3 main.py discover-graph --target-id petclinic-react --format mermaid
```

### Explain Graph Node

```bash
python3 main.py explain-graph-node \
  --target-id petclinic-react \
  --path client/src/components/App.tsx
```

### Analyze / Plan / Propose

```bash
python3 main.py analyze-feature \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)"
```

```bash
python3 main.py plan-feature \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)"
```

```bash
python3 main.py propose-changes \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)"
```

### Explain Feature

```bash
python3 main.py explain-feature \
  --target-id petclinic-react \
  "Add Layout and Welcome page"
```

### Learning

```bash
python3 main.py refresh-learning \
  --target-id petclinic-react \
  --limit 300 \
  --max-files 30 \
  --force-full-rescan
```

```bash
python3 main.py learning-status --target-id petclinic-react
```

```bash
python3 main.py list-change-recipes --target-id petclinic-react
```

```bash
python3 main.py suggest-from-recipes \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)"
```

### Plan Bundle

```bash
python3 main.py generate-plan-bundle \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)" \
  --format json \
  --output reports/demo/owners_page_plan_bundle.json
```

```bash
python3 main.py generate-plan-bundle \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)" \
  --format markdown \
  --output reports/demo/owners_page_plan_bundle.md
```

### Eval Suite

```bash
python3 scripts/run_eval_suite.py
```

### Replay Candidate Finder

```bash
python3 scripts/find_replay_candidates.py \
  --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs \
  --limit 300 \
  --max-files 25 \
  --write-cases \
  --cases-output tests/replay_cases/petclinic_auto_replay_cases.json \
  --per-archetype 2
```

### Replay Single Commit

```bash
python3 scripts/replay_git_history_eval.py \
  --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs \
  --commit f710ba8 \
  --prompt "Add Layout and Welcome page"
```

### Replay Matrix

```bash
python3 scripts/run_replay_matrix.py \
  --cases tests/replay_cases/petclinic_auto_replay_cases.json
```

### Debug Replay Case

```bash
python3 scripts/debug_replay_case.py \
  --matrix reports/replay/matrix/latest_matrix.json \
  --case-id ui_page_add_0a36a33_add_ownerspage_no_actions_yet
```

### Baseline Saving

```bash
python3 scripts/save_baseline.py \
  --name petclinic_recipe_assisted_baseline_2026_04_25 \
  --target-id petclinic-react
```

## 9. Current PetClinic Baseline

The current saved PetClinic recipe-assisted baseline is:

```text
reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/
```

Current baseline metrics:

- Eval suite: `14/14` passing
- Replay matrix: `8/8` succeeded
- Recipe helped cases: `5/8`
- Combined worse than planner cases: `0`
- Planner/propose high-signal recall: about `0.37`
- Recipe suggestions high-signal recall: about `0.71`
- Combined high-signal recall: about `0.72`

Proof cases:

- `Add Layout and Welcome page`: proved UI-shell discovery and replay scoring can capture high-signal files like `WelcomePage.tsx`, `App.tsx`, `main.tsx`, and `public/index.html`, while treating static assets separately.
- `Add OwnersPage (no actions yet)`: proved recipe-assisted page-add planning can recover `OwnersPage.tsx`, route config, and frontend types.
- `Owners search has been case insensitive`: proved backend search/query recipes can recover query/data surfaces such as `src/main/resources/db/hsqldb/initDB.sql` even when planner-native suggestions are weak.
- `Add visual feedback for invalid fields`: proved UI form validation recipes can recover the relevant form/page surface, such as `NewOwnerPage.tsx`, instead of generic error pages.

These numbers are prototype evidence, not production guarantees. They are useful because they are measured against real Git history rather than only hand-authored examples.

## 10. Example Plan Bundle

For:

```text
Add OwnersPage (no actions yet)
```

The Plan Bundle JSON is abbreviated below:

```json
{
  "schema_version": "1.0",
  "feature_request": "Add OwnersPage (no actions yet)",
  "summary": {
    "detected_intents": ["ui"],
    "planning_mode": "planner+recipe",
    "recipe_assisted": true
  },
  "ownership": {
    "implementation_owner": "spring-petclinic-reactjs",
    "domain_owner": null
  },
  "recommended_change_set": [
    {
      "repo_name": "spring-petclinic-reactjs",
      "path": "client/src/components/owners/OwnersPage.tsx",
      "action": "inspect",
      "priority": 1,
      "confidence": "high",
      "source": "recipe",
      "node_type": "page_component",
      "reason": "Requested page/component already exists in the current source graph; inspect or update instead of creating it."
    }
  ],
  "matched_recipes": [
    {
      "recipe_type": "ui_page_add",
      "structural_confidence": 0.98,
      "planner_effectiveness": 0.05
    }
  ]
}
```

A handoff prompt excerpt looks like:

```text
You are working in repo: spring-petclinic-reactjs.

Task:
Add OwnersPage (no actions yet).

Expected change:
- Add or update the OwnersPage surface.
- Wire it into configureRoutes.tsx.
- Inspect/update frontend types only if needed.
- Use nearby owner pages as references.
- Keep this UI-only; do not add backend/API behavior.
```

The full generated examples live under `reports/demo/` when present.

## 11. How To Reproduce The Demo

1. Clone or prepare the PetClinic React repo under `eval_repos/`.

```bash
mkdir -p eval_repos/spring-petclinic-reactjs
```

Place the repo at:

```text
eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs
```

2. Register the discovery target.

```bash
python3 main.py register-discovery-target petclinic-react \
  --source-type local_path \
  --locator eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs
```

3. Run discovery.

```bash
python3 main.py discover-architecture --target-id petclinic-react
```

4. Refresh learning.

```bash
python3 main.py refresh-learning \
  --target-id petclinic-react \
  --limit 300 \
  --max-files 30 \
  --force-full-rescan
```

5. Generate a Plan Bundle.

```bash
python3 main.py generate-plan-bundle \
  --target-id petclinic-react \
  "Add OwnersPage (no actions yet)" \
  --format json \
  --output reports/demo/owners_page_plan_bundle.json
```

6. Run the replay matrix.

```bash
python3 scripts/run_replay_matrix.py \
  --cases tests/replay_cases/petclinic_auto_replay_cases.json
```

## 12. Project Structure

The main repo structure is:

```text
.
├── main.py
├── workspace_control/
│   ├── cli.py
│   ├── analyze.py
│   ├── plan.py
│   ├── propose.py
│   ├── plan_bundle.py
│   ├── graph.py
│   ├── explain.py
│   └── inventory.py
├── app/
│   ├── adapters/
│   ├── framework_packs/
│   │   ├── openapi.json
│   │   ├── react.json
│   │   └── spring_boot.json
│   ├── graph/
│   │   ├── pattern_packs/
│   │   └── source_graph_builder.py
│   ├── models/
│   ├── providers/
│   └── services/
├── scripts/
│   ├── debug_replay_case.py
│   ├── find_replay_candidates.py
│   ├── replay_git_history_eval.py
│   ├── run_demo.py
│   ├── run_eval_suite.py
│   ├── run_public_repo_probe.py
│   ├── run_replay_matrix.py
│   └── save_baseline.py
├── tests/
│   ├── eval_cases/
│   ├── fixtures/
│   └── replay_cases/
├── reports/
│   ├── baselines/
│   ├── demo/
│   ├── learning/
│   └── replay/
└── data/
    └── learning/
```

Important areas:

- `workspace_control/`: CLI-facing orchestration modules.
- `app/models/`: Pydantic models for manifests, discovery, plans, graph, recipes, and learning state.
- `app/services/`: deterministic services for loading manifests, discovery, profile inference, grounding, planning, recipes, and learning.
- `app/graph/`: source graph builder and pattern packs.
- `app/framework_packs/`: local framework priors.
- `app/providers/`: discovery providers.
- `scripts/`: eval, replay, learning, demo, and baseline utilities.
- `tests/`: unit tests, fixture workspaces, eval cases, and replay cases.
- `reports/`: generated eval, replay, learning, demo, and baseline artifacts.
- `data/learning/`: repo-local learned recipe catalogs and state.

## 13. Development Workflow

Recommended workflow:

1. Make a focused code or documentation change.
2. Run pytest for unit coverage.

```bash
pytest
```

3. Run the eval suite for planner/proposal behavior.

```bash
python3 scripts/run_eval_suite.py
```

4. Run the replay matrix if planner, proposal, recipe, graph, or replay behavior changed.

```bash
python3 scripts/run_replay_matrix.py \
  --cases tests/replay_cases/petclinic_auto_replay_cases.json
```

5. Inspect debug reports for weak cases.

```bash
python3 scripts/debug_replay_case.py \
  --matrix reports/replay/matrix/latest_matrix.json \
  --case-id ui_page_add_0a36a33_add_ownerspage_no_actions_yet
```

6. Save a baseline for major checkpoints.

```bash
python3 scripts/save_baseline.py \
  --name petclinic_recipe_assisted_baseline_2026_04_25 \
  --target-id petclinic-react
```

For documentation-only changes, a lightweight README heading check is usually enough unless documentation examples intentionally depend on freshly generated reports.

## 14. Known Limitations

Current limitations:

- The strongest benchmark is currently PetClinic-style public repo history.
- `local_path` is the strongest provider today.
- `git_url` and `remote_agent` are future/stub provider directions.
- The source graph is heuristic.
- Source parsing is mostly path, filename, regex, and lightweight content scanning, not a full AST.
- Recipe learning quality depends on commit quality.
- Replay prompts generated from commit subjects can be noisy.
- Recipe suggestions can overpredict.
- Company repos may require custom framework packs or domain packs.
- The system is not production-ready.
- There is no auth, hosted API, security model, web UI, or multi-user workspace backend yet.
- There is no LLM integration yet.
- Framework packs are local priors, not live external documentation.

These limitations are part of the design posture: measure first, keep uncertainty visible, and avoid pretending the planner knows more than the evidence supports.

## 15. Roadmap

Possible next phases:

1. Local web UI or FastAPI + React shell.
2. Workspace persistence with SQLite.
3. GitHub URL ingestion.
4. Second public repo benchmark.
5. Route, state, API-client, and DB pattern packs.
6. Graph quality improvements.
7. Repo-specific prompt pack export.
8. GitHub issue export.
9. Optional LLM summarization over graph evidence.
10. UI for Plan Bundle rendering.

A likely product path is to make Plan Bundle JSON the stable API first, then build a UI that renders it into ownership cards, change-set tables, recipe evidence, caveats, and copy-ready handoff prompts.

## 16. Relationship To Claude / Copilot / Codex

Workspace-Control is not a coding agent replacement.

Claude, Copilot, Codex, Cursor, and similar tools are execution agents. They are good at editing code when given the right repo, files, context, constraints, and task framing.

Workspace-Control is the control-plane and evidence layer above them. It can generate better prompts and tasks for those tools.

A future workflow could look like:

```text
feature request
  -> StackPilot Plan Bundle
  -> repo-specific handoff prompt
  -> coding agent executes
  -> replay/learning loop updates repo-local recipes
```

That division keeps execution tools focused and gives teams persistent planning memory outside any one chat or IDE session.

## 17. Safety / Read-Only Assumptions

Safety assumptions:

- Target repos are read-only by default.
- Discovery scans files and folders but does not edit them.
- Replay uses parent snapshots, temporary materialization, or worktree/archive-style flows instead of modifying the main target repo.
- Learning writes local metadata and reports under this workspace, not target source files.
- Framework packs are local files and are not fetched from the internet at runtime.
- No LLM calls are made by the current planner, proposal, replay, or learning pipeline.
- Proposal output is advisory. It does not apply edits.

The main files that change during normal analysis are generated artifacts under `reports/` and repo-local learning state under `data/learning/`.

## 18. Glossary

Discovery target: A registered source of repository evidence, such as a local path.

Source graph: A normalized graph of source surfaces and relationships, represented by typed nodes and edges.

Framework pack: A local JSON prior describing common paths, node kinds, naming patterns, and validation hints for a framework.

Inferred metadata: A deterministic repo profile synthesized from discovered source when explicit `stackpilot.yml` metadata is absent.

Recipe: A repo-local historical change pattern mined from Git commits.

Structural confidence: Confidence that a recipe reflects a consistent historical change structure.

Planner effectiveness: How well the current planner/proposer predicts a recipe during replay.

Replay matrix: A set of historical commits replayed from their parent snapshots to compare predicted changes against actual diffs.

Plan Bundle: A structured JSON artifact containing ownership, recommendations, evidence, caveats, validation, recipes, and handoff prompts.

Handoff prompt: A repo-specific, copy-ready prompt intended for a coding agent.

## 19. Future UI Contract

Plan Bundle JSON is designed for UI rendering.

Important fields include:

- `schema_version`
- `feature_request`
- `generated_at`
- `target`
- `summary`
- `ownership`
- `recommended_change_set`
- `matched_recipes`
- `source_graph_evidence`
- `validation`
- `risks_and_caveats`
- `handoff_prompts`
- `debug`

UI-friendly design rules:

- Recommended files include priority, action, confidence, source, and reason.
- Every independently displayable row includes `repo_name` where appropriate.
- Planner-native and recipe-assisted evidence remain distinguishable.
- Caveats and missing evidence are first-class data, not prose-only afterthoughts.
- Markdown is generated from the same data structure rather than becoming the source of truth.

## 20. Contributing / Notes For Future Agents

Guidance for future Codex, Claude, Copilot, or human contributors:

- Do not remove the separation between planner-native and recipe-assisted output.
- Do not silently wire recipes into planning without measuring the impact.
- Preserve planner-only, recipe-only, and combined replay metrics.
- Keep deterministic tests around graph, replay, recipe, and Plan Bundle behavior.
- Keep target repositories read-only unless a future feature explicitly changes that contract.
- Prefer source graph and framework-pack improvements over one-off feature rules.
- Update this README when changing architecture or command behavior.
- Run evals before claiming success.
- For major checkpoints, save a named baseline under `reports/baselines/`.

The prototype is useful precisely because it is cautious: it shows what it knows, what it inferred, what history suggests, and what remains uncertain.
