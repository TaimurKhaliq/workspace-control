# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `bf56f154a31972ca6f0c3ac4b1408fa1a81c48be`
- target commit: `202ddf78ca3f0057994c41f0400caab6023c722a`
- prompt: Move Resources to /api/* endpoint
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 5
- actual files: 3
- matched files: 1
- missed files: 2
- extra predicted files: 4
- exact file precision: 0.20
- exact file recall: 0.33
- folder-level matched actual files: 0
- category precision: 0.50
- category recall: 1.00
- high-signal exact precision: 0.20
- high-signal exact recall: 0.33
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
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/AbstractResourceController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`

## Matched Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/AbstractResourceController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`

## Extra Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.50
- recall: 1.00
- matched: `api_controller`
- missed: -
- extra predicted: `service_layer`

## Exact File Scoring

- precision: 0.20
- recall: 0.33
- predicted count: 5
- actual count: 3
- matched count: 1
- missed count: 2
- extra predicted count: 4

## High-Signal File Scoring

- precision: 0.20
- recall: 0.33
- predicted count: 5
- actual count: 3
- matched count: 1
- missed count: 2
- extra predicted count: 4

## High-Signal Matched Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

## High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/AbstractResourceController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
