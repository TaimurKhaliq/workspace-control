# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `23824f262aeabad50b9f7137de8498fead9fb01f`
- target commit: `bf56f154a31972ca6f0c3ac4b1408fa1a81c48be`
- prompt: Move Resource RestController to web.api package
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 5
- actual files: 5
- matched files: 0
- missed files: 5
- extra predicted files: 5
- exact file precision: 0.00
- exact file recall: 0.00
- folder-level matched actual files: 0
- category precision: 0.50
- category recall: 0.50
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

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerResource.java`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/AbstractWebResourceTests.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/PetResourceTests.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/VetResourceTests.java`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/AbstractWebResourceTests.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/PetResourceTests.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/VetResourceTests.java`

## Extra Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerResource.java`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.50
- recall: 0.50
- matched: `api_controller`
- missed: `unknown`
- extra predicted: `service_layer`

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 5
- actual count: 5
- matched count: 0
- missed count: 5
- extra predicted count: 5

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 5
- actual count: 5
- matched count: 0
- missed count: 5
- extra predicted count: 5

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/AbstractWebResourceTests.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/PetResourceTests.java`
- `spring-petclinic-reactjs/src/test/java/org/springframework/samples/petclinic/web/api/VetResourceTests.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
