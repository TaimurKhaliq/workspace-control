# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `3f55127f558f5a55799652c058d4938772f8ea1a`
- target commit: `49ca65bd235ce802df7a92dc167f4873f0d2786b`
- prompt: Add NewOwnerPage (missing error handling)
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- actual files: 11
- recipe helped: True (improved_recall)
- recipe matched files: `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`, `spring-petclinic-reactjs/client/src/configureRoutes.tsx`, `spring-petclinic-reactjs/client/src/types/index.ts`
- static asset misses: 0

### Prediction Mode Summary

| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |
|---|---:|---:|---|---|---|
| planner/propose only | 4 | 3 | 0.75/0.27 | 1.00/0.40 | 0.75/0.27 |
| recipe suggestions only | 11 | 3 | 0.27/0.27 | 0.50/0.40 | 0.27/0.27 |
| combined | 12 | 4 | 0.33/0.36 | 0.50/0.40 | 0.33/0.36 |

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

- predicted files: 4
- matched files: 3
- missed files: 8
- extra predicted files: 1
- exact precision: 0.75
- exact recall: 0.27
- high-signal precision: 0.75
- high-signal recall: 0.27
- category precision: 1.00
- category recall: 0.40
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 11
- matched files: 3
- missed files: 8
- extra predicted files: 8
- exact precision: 0.27
- exact recall: 0.27
- high-signal precision: 0.27
- high-signal recall: 0.27
- category precision: 0.50
- category recall: 0.40
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 12
- matched files: 4
- missed files: 7
- extra predicted files: 8
- exact precision: 0.33
- exact recall: 0.36
- high-signal precision: 0.33
- high-signal recall: 0.36
- category precision: 0.50
- category recall: 0.40
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: error, handling; source graph contains related domain token(s): owner; request mentions form validation or invalid-field feedback
  - `petclinic_react_ui_page_add` (ui_page_add, structural=0.98, planner=0.05)
    - why: source graph contains related domain token(s): owner; request verb includes add; identifier normalization exposes page-style term(s): owner, page
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: matched recipe trigger terms: error, handling, missing; source graph contains related domain token(s): owner; request combines UI surface terms with error/API-style change hints

- suggested actions:
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/NewOwnerPage.tsx` (create, high, node=page_component, exists_in_parent=False, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/configureRoutes.tsx` (modify, high, node=route_config, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/ErrorPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/vets/VetsPage.tsx` (inspect, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)

## Planner/Propose Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Actual Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/InvalidRequestException.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## Planner/Propose Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Recipe Suggestions Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Combined Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Planner/Propose Missed Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/InvalidRequestException.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## Planner/Propose Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Planner/Propose Folder-Level Matches

-

## Planner/Propose Category-Level Matches

- precision: 1.00
- recall: 0.40
- matched: `frontend_component`, `frontend_type`
- missed: `api_dto`, `frontend_entrypoint`, `unknown`
- extra predicted: -

## Planner/Propose Exact File Scoring

- precision: 0.75
- recall: 0.27
- predicted count: 4
- actual count: 11
- matched count: 3
- missed count: 8
- extra predicted count: 1

## Planner/Propose High-Signal File Scoring

- precision: 0.75
- recall: 0.27
- predicted count: 4
- actual count: 11
- matched count: 3
- missed count: 8
- extra predicted count: 1

## Planner/Propose High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Planner/Propose High-Signal Missed Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/InvalidRequestException.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
