# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `49ca65bd235ce802df7a92dc167f4873f0d2786b`
- target commit: `339ee36d7da27221aba4866cc2ee91c6e96d4746`
- prompt: Add error handling to NewOwnerPage
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 3
- actual files: 3
- matched files: 2
- missed files: 1
- extra predicted files: 1
- exact file precision: 0.67
- exact file recall: 0.67
- folder-level matched actual files: 0
- category precision: 1.00
- category recall: 0.50
- high-signal exact precision: 0.67
- high-signal exact recall: 0.67
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

- predicted files: 9
- matched files: 2
- missed files: 1
- extra predicted files: 7
- exact precision: 0.22
- exact recall: 0.67
- high-signal precision: 0.22
- high-signal recall: 0.67
- category precision: 0.50
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 10
- matched files: 3
- missed files: 0
- extra predicted files: 7
- exact precision: 0.30
- exact recall: 1.00
- high-signal precision: 0.30
- high-signal recall: 1.00
- category precision: 0.50
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: error, handling; source graph contains related domain token(s): owner; request mentions form validation or invalid-field feedback
  - `petclinic_react_ui_page_add` (ui_page_add, structural=0.98, planner=0.05)
    - why: source graph contains related domain token(s): owner; request verb includes add; identifier normalization exposes page-style term(s): owner, page
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: matched recipe trigger terms: error, handling; source graph contains related domain token(s): owner; request combines UI surface terms with error/API-style change hints

- suggested actions:
  - `spring-petclinic-reactjs/client/src/components/ErrorPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/configureRoutes.tsx` (modify, high, node=route_config, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/ErrorPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/ErrorPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)

## Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Actual Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Missed Files

- `spring-petclinic-reactjs/client/src/types/index.ts`

## Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 1.00
- recall: 0.50
- matched: `frontend_component`
- missed: `frontend_type`
- extra predicted: -

## Exact File Scoring

- precision: 0.67
- recall: 0.67
- predicted count: 3
- actual count: 3
- matched count: 2
- missed count: 1
- extra predicted count: 1

## High-Signal File Scoring

- precision: 0.67
- recall: 0.67
- predicted count: 3
- actual count: 3
- matched count: 2
- missed count: 1
- extra predicted count: 1

## High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## High-Signal Missed Files

- `spring-petclinic-reactjs/client/src/types/index.ts`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
