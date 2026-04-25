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
- category precision: 0.25
- category recall: 1.00
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

- precision: 0.25
- recall: 1.00
- matched: `unknown`
- missed: -
- extra predicted: `frontend_component`, `repository`, `service_layer`

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
