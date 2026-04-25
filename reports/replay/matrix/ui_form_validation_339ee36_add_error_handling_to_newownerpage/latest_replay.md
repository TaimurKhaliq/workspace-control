# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `49ca65bd235ce802df7a92dc167f4873f0d2786b`
- target commit: `339ee36d7da27221aba4866cc2ee91c6e96d4746`
- prompt: Add error handling to NewOwnerPage
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- actual files: 3
- recipe helped: True (improved_recall)
- combined worse than planner: False (-)
- recipe matched files: `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`, `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`, `spring-petclinic-reactjs/client/src/types/index.ts`
- static asset misses: 0

### Prediction Mode Summary

| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |
|---|---:|---:|---|---|---|
| planner/propose only | 3 | 2 | 0.67/0.67 | 1.00/0.50 | 0.67/0.67 |
| recipe suggestions only | 8 | 3 | 0.38/1.00 | 0.50/1.00 | 0.38/1.00 |
| combined | 4 | 3 | 0.75/1.00 | 1.00/1.00 | 0.75/1.00 |

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

- predicted files: 3
- matched files: 2
- missed files: 1
- extra predicted files: 1
- exact precision: 0.67
- exact recall: 0.67
- high-signal precision: 0.67
- high-signal recall: 0.67
- category precision: 1.00
- category recall: 0.50
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 8
- matched files: 3
- missed files: 0
- extra predicted files: 5
- exact precision: 0.38
- exact recall: 1.00
- high-signal precision: 0.38
- high-signal recall: 1.00
- category precision: 0.50
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

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

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: error, handling; source graph contains related domain token(s): owner; request mentions form validation or invalid-field feedback
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: matched recipe trigger terms: error, handling; source graph contains related domain token(s): owner; request combines UI surface terms with error/API-style change hints

- suggested actions:
  - `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)

## Planner/Propose Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Actual Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Planner/Propose Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Recipe Suggestions Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Combined Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Planner/Propose Missed Files

- `spring-petclinic-reactjs/client/src/types/index.ts`

## Planner/Propose Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`

## Planner/Propose Folder-Level Matches

-

## Planner/Propose Category-Level Matches

- precision: 1.00
- recall: 0.50
- matched: `frontend_component`
- missed: `frontend_type`
- extra predicted: -

## Planner/Propose Exact File Scoring

- precision: 0.67
- recall: 0.67
- predicted count: 3
- actual count: 3
- matched count: 2
- missed count: 1
- extra predicted count: 1

## Planner/Propose High-Signal File Scoring

- precision: 0.67
- recall: 0.67
- predicted count: 3
- actual count: 3
- matched count: 2
- missed count: 1
- extra predicted count: 1

## Planner/Propose High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Planner/Propose High-Signal Missed Files

- `spring-petclinic-reactjs/client/src/types/index.ts`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
