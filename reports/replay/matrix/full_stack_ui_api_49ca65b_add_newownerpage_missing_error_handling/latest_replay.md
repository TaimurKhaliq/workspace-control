# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `3f55127f558f5a55799652c058d4938772f8ea1a`
- target commit: `49ca65bd235ce802df7a92dc167f4873f0d2786b`
- prompt: Add NewOwnerPage (missing error handling)
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 4
- actual files: 11
- matched files: 3
- missed files: 8
- extra predicted files: 1
- exact file precision: 0.75
- exact file recall: 0.27
- folder-level matched actual files: 0
- category precision: 1.00
- category recall: 0.40
- high-signal exact precision: 0.75
- high-signal exact recall: 0.27
- static asset misses: 0

## Command Results

| command | exit code |
|---|---:|
| `discover_architecture` | 0 |
| `analyze_feature` | 0 |
| `plan_feature` | 0 |
| `propose_changes` | 0 |

## Predicted Files

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

## Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Missed Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/InvalidRequestException.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 1.00
- recall: 0.40
- matched: `frontend_component`, `frontend_type`
- missed: `api_controller`, `frontend_entrypoint`, `unknown`
- extra predicted: -

## Exact File Scoring

- precision: 0.75
- recall: 0.27
- predicted count: 4
- actual count: 11
- matched count: 3
- missed count: 8
- extra predicted count: 1

## High-Signal File Scoring

- precision: 0.75
- recall: 0.27
- predicted count: 4
- actual count: 11
- matched count: 3
- missed count: 8
- extra predicted count: 1

## High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## High-Signal Missed Files

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
