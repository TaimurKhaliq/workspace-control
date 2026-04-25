# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `6970eb512f7dc67cd48ddadc7e4f7568ae2dbfef`
- target commit: `af3110436e24ef13d68382e060a7250638625301`
- prompt: add max range and not null validation for adding new pet
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- actual files: 1
- recipe helped: True (improved_recall)
- recipe matched files: `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`
- static asset misses: 0

### Prediction Mode Summary

| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |
|---|---:|---:|---|---|---|
| planner/propose only | 5 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| recipe suggestions only | 13 | 1 | 0.08/1.00 | 0.17/1.00 | 0.08/1.00 |
| combined | 17 | 1 | 0.06/1.00 | 0.14/1.00 | 0.06/1.00 |

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
- matched files: 0
- missed files: 1
- extra predicted files: 5
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.00
- category recall: 0.00
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 13
- matched files: 1
- missed files: 0
- extra predicted files: 12
- exact precision: 0.08
- exact recall: 1.00
- high-signal precision: 0.08
- high-signal recall: 1.00
- category precision: 0.17
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 17
- matched files: 1
- missed files: 0
- extra predicted files: 16
- exact precision: 0.06
- exact recall: 1.00
- high-signal precision: 0.06
- high-signal recall: 1.00
- category precision: 0.14
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_backend_validation_change` (backend_validation_change, structural=0.72, planner=0.10)
    - why: matched recipe trigger terms: pet; source graph contains related domain token(s): not, pet; request mentions backend validation or constraint terms
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: validation; source graph contains related domain token(s): not, pet; request mentions form validation or invalid-field feedback
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: source graph contains related domain token(s): not, pet; request combines UI surface terms with error/API-style change hints; feature intent includes api

- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Owner.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Pet.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java` (inspect, medium, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/SelectInput.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/visits/VisitsPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/pets/PetEditor.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/visits/VisitsPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/pets/PetEditor.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` (modify, high, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)

## Planner/Propose Predicted Files

- `spring-petclinic-reactjs/Run PetClinicApplication.launch`
- `spring-petclinic-reactjs/client/src/components/pets/EditPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/NewPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/createPetEditorModel.ts`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Planner/Propose Matched Files

-

## Recipe Suggestions Matched Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Combined Matched Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Planner/Propose Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Planner/Propose Extra Predicted Files

- `spring-petclinic-reactjs/Run PetClinicApplication.launch`
- `spring-petclinic-reactjs/client/src/components/pets/EditPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/NewPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/createPetEditorModel.ts`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java`

## Planner/Propose Folder-Level Matches

-

## Planner/Propose Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `api_dto`
- extra predicted: `api_controller`, `frontend_component`, `unknown`

## Planner/Propose Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 5
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 5

## Planner/Propose High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 5
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 5

## Planner/Propose High-Signal Matched Files

-

## Planner/Propose High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
