# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `af3110436e24ef13d68382e060a7250638625301`
- target commit: `c758321ee85dd208eae6fd1a438d3f855c94e182`
- prompt: add regex validation for string input
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 4
- actual files: 1
- matched files: 0
- missed files: 1
- extra predicted files: 4
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

- predicted files: 4
- matched files: 0
- missed files: 1
- extra predicted files: 4
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.00
- category recall: 0.00
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 11
- matched files: 0
- missed files: 1
- extra predicted files: 11
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.17
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 15
- matched files: 0
- missed files: 1
- extra predicted files: 15
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.12
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_backend_validation_change` (backend_validation_change, structural=0.72, planner=0.08)
    - why: matched recipe trigger terms: validation; source graph contains related domain token(s): input; request mentions backend validation or constraint terms
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: validation; source graph contains related domain token(s): input; request mentions form validation or invalid-field feedback
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: source graph contains related domain token(s): input; request combines UI surface terms with error/API-style change hints; feature intent includes api

- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (inspect, medium, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/NamedEntity.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` (modify, medium, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/Input.tsx` (modify, medium, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` (modify, medium, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/Input.tsx` (modify, medium, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)

## Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Extra Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `domain_model`
- extra predicted: `repository`, `service_layer`, `unknown`

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 4
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 4

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 4
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 4

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
