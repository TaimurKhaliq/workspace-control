# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `af3110436e24ef13d68382e060a7250638625301`
- target commit: `c758321ee85dd208eae6fd1a438d3f855c94e182`
- prompt: add regex validation for string input
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- actual files: 1
- recipe helped: False (same)
- recipe matched files: -
- static asset misses: 0

### Prediction Mode Summary

| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |
|---|---:|---:|---|---|---|
| planner/propose only | 4 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| recipe suggestions only | 13 | 0 | 0.00/0.00 | 0.17/1.00 | 0.00/0.00 |
| combined | 17 | 0 | 0.00/0.00 | 0.12/1.00 | 0.00/0.00 |

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

- predicted files: 13
- matched files: 0
- missed files: 1
- extra predicted files: 13
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.17
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 17
- matched files: 0
- missed files: 1
- extra predicted files: 17
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.12
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_backend_validation_change` (backend_validation_change, structural=0.72, planner=0.10)
    - why: source graph contains related domain token(s): input; request mentions backend validation or constraint terms; feature intent includes api
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: validation; source graph contains related domain token(s): input; request mentions form validation or invalid-field feedback
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: source graph contains related domain token(s): input; request combines UI surface terms with error/API-style change hints; feature intent includes api

- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/NamedEntity.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (inspect, medium, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/SelectInput.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/Input.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/visits/VisitsPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/Input.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)

## Planner/Propose Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Planner/Propose Matched Files

-

## Recipe Suggestions Matched Files

-

## Combined Matched Files

-

## Planner/Propose Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Planner/Propose Extra Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Planner/Propose Folder-Level Matches

-

## Planner/Propose Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `domain_model`
- extra predicted: `repository`, `service_layer`, `unknown`

## Planner/Propose Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 4
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 4

## Planner/Propose High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 4
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 4

## Planner/Propose High-Signal Matched Files

-

## Planner/Propose High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
