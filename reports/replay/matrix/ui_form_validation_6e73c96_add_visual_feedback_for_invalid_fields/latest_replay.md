# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `339ee36d7da27221aba4866cc2ee91c6e96d4746`
- target commit: `6e73c96acc9c28219709faf5f530c0390f6af925`
- prompt: Add visual feedback for invalid fields
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 0
- actual files: 2
- matched files: 0
- missed files: 2
- extra predicted files: 0
- exact file precision: 0.00
- exact file recall: 0.00
- folder-level matched actual files: 0
- category precision: 0.00
- category recall: 0.00
- high-signal exact precision: 0.00
- high-signal exact recall: 0.00
- static asset misses: 0

## Command Results

| command | exit code |
|---|---:|
| `discover_architecture` | 0 |
| `analyze_feature` | 0 |
| `plan_feature` | 0 |
| `propose_changes` | 0 |
| `suggest_from_recipes` | 0 |

## Planner/Propose Predictions Only

- predicted files: 0
- matched files: 0
- missed files: 2
- extra predicted files: 0
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.00
- category recall: 0.00
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 3
- matched files: 0
- missed files: 2
- extra predicted files: 3
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.50
- category recall: 0.50
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 3
- matched files: 0
- missed files: 2
- extra predicted files: 3
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.50
- category recall: 0.50
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: feedback, fields, invalid, visual; source graph contains related domain token(s): invalid; request mentions form validation or invalid-field feedback

- suggested actions:
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/ErrorPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/NotFoundPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)

## Predicted Files

-

## Actual Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`

## Extra Predicted Files

-

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `frontend_component`, `unknown`
- extra predicted: -

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 2
- matched count: 0
- missed count: 2
- extra predicted count: 0

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 2
- matched count: 0
- missed count: 2
- extra predicted count: 0

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
