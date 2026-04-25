# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `6970eb512f7dc67cd48ddadc7e4f7568ae2dbfef`
- target commit: `af3110436e24ef13d68382e060a7250638625301`
- prompt: add max range and not null validation for adding new pet
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 11
- actual files: 1
- matched files: 0
- missed files: 1
- extra predicted files: 11
- exact file precision: 0.00
- exact file recall: 0.00
- folder-level matched actual files: 1
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

- predicted files: 11
- matched files: 0
- missed files: 1
- extra predicted files: 11
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.00
- category recall: 0.00
- folder-level matched actual files: 1

## Recipe Suggestions Only

- predicted files: 11
- matched files: 1
- missed files: 0
- extra predicted files: 10
- exact precision: 0.09
- exact recall: 1.00
- high-signal precision: 0.09
- high-signal recall: 1.00
- category precision: 0.17
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 22
- matched files: 1
- missed files: 0
- extra predicted files: 21
- exact precision: 0.05
- exact recall: 1.00
- high-signal precision: 0.05
- high-signal recall: 1.00
- category precision: 0.12
- category recall: 1.00
- folder-level matched actual files: 1

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_backend_validation_change` (backend_validation_change, structural=0.72, planner=0.08)
    - why: matched recipe trigger terms: validation; source graph contains related domain token(s): not, pet; request mentions backend validation or constraint terms
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.96, planner=0.00)
    - why: matched recipe trigger terms: validation; source graph contains related domain token(s): not, pet; request mentions form validation or invalid-field feedback
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.92, planner=0.32)
    - why: source graph contains related domain token(s): not, pet; request combines UI surface terms with error/API-style change hints; feature intent includes api

- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java` (modify, high, node=api_dto, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java` (inspect, medium, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Owner.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Pet.java` (modify, medium, node=domain_model, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java` (modify, high, node=api_controller, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/Constraints.ts` (modify, medium, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/NotFoundPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/form/Constraints.ts` (modify, medium, node=form_component, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/types/index.ts` (inspect, medium, node=frontend_type, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/client/src/components/NotFoundPage.tsx` (modify, medium, node=page_component, exists_in_parent=True, matched_actual=no)

## Predicted Files

- `spring-petclinic-reactjs/Run PetClinicApplication.launch`
- `spring-petclinic-reactjs/client/src/components/owners/PetsTable.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/EditPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/NewPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/PetEditor.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/createPetEditorModel.ts`
- `spring-petclinic-reactjs/client/src/components/visits/PetDetails.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Extra Predicted Files

- `spring-petclinic-reactjs/Run PetClinicApplication.launch`
- `spring-petclinic-reactjs/client/src/components/owners/PetsTable.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/EditPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/NewPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/PetEditor.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/createPetEditorModel.ts`
- `spring-petclinic-reactjs/client/src/components/visits/PetDetails.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Folder-Level Matches

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `api_dto`
- extra predicted: `frontend_component`, `repository`, `service_layer`, `unknown`

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 11
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 11

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 11
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 11

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
