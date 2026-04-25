# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `d2017b8f57050830ec8980f7b578eb272c66af67`
- target commit: `0a36a33c0101b3aad023dbc7a6ebe440755af968`
- prompt: Add OwnersPage (no actions yet)
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- actual files: 3
- recipe helped: True (improved_precision)
- recipe matched files: `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`, `spring-petclinic-reactjs/client/src/configureRoutes.tsx`, `spring-petclinic-reactjs/client/src/types/index.ts`
- static asset misses: 0

### Prediction Mode Summary

| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |
|---|---:|---:|---|---|---|
| planner/propose only | 5 | 3 | 0.60/1.00 | 1.00/1.00 | 0.60/1.00 |
| recipe suggestions only | 4 | 3 | 0.75/1.00 | 1.00/1.00 | 0.75/1.00 |
| combined | 5 | 3 | 0.60/1.00 | 1.00/1.00 | 0.60/1.00 |

The planner/propose, recipe-only, and combined rows are intentionally separate so recipe-assisted success is not hidden by planner-only misses.

## Command Results

| command | exit code |
|---|---:|
| `discover_architecture` | 0 |
| `analyze_feature` | 0 |
| `plan_feature` | 0 |
| `propose_changes` | 0 |
| `suggest_from_recipes` | 0 |

## Planner/Propose Predictions Only

- predicted files: 5
- matched files: 3
- missed files: 0
- extra predicted files: 2
- exact precision: 0.60
- exact recall: 1.00
- high-signal precision: 0.60
- high-signal recall: 1.00
- category precision: 1.00
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 4
- matched files: 3
- missed files: 0
- extra predicted files: 1
- exact precision: 0.75
- exact recall: 1.00
- high-signal precision: 0.75
- high-signal recall: 1.00
- category precision: 1.00
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 5
- matched files: 3
- missed files: 0
- extra predicted files: 2
- exact precision: 0.60
- exact recall: 1.00
- high-signal precision: 0.60
- high-signal recall: 1.00
- category precision: 1.00
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_ui_page_add` (ui_page_add, structural=0.98, planner=0.05)
    - why: source graph contains related domain token(s): owner, owners; request verb includes add; identifier normalization exposes page-style term(s): owner, owners, page

- suggested actions:
  - `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx` (create, high, node=page_component, exists_in_parent=False, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/configureRoutes.tsx` (modify, high, node=route_config, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=no)

## Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/types.ts`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Actual Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Missed Files

-

## Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/types.ts`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 1.00
- recall: 1.00
- matched: `frontend_component`, `frontend_type`
- missed: -
- extra predicted: -

## Exact File Scoring

- precision: 0.60
- recall: 1.00
- predicted count: 5
- actual count: 3
- matched count: 3
- missed count: 0
- extra predicted count: 2

## High-Signal File Scoring

- precision: 0.60
- recall: 1.00
- predicted count: 5
- actual count: 3
- matched count: 3
- missed count: 0
- extra predicted count: 2

## High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## High-Signal Missed Files

-

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
