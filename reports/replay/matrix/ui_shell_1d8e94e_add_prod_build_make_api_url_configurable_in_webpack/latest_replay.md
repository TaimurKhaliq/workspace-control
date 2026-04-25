# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `858a501244daf08e53d76c1b897b24e3265f7436`
- target commit: `1d8e94e3b84a4321685d5657ed094b993c45ad72`
- prompt: Add prod build, make Api-URL configurable in webpack
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 6
- actual files: 5
- matched files: 0
- missed files: 5
- extra predicted files: 6
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

## Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FailingApiController.java`

## Actual Files

- `spring-petclinic-reactjs/.travis.yml`
- `spring-petclinic-reactjs/client/package.json`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/client/webpack.config.js`
- `spring-petclinic-reactjs/client/webpack.config.prod.js`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/.travis.yml`
- `spring-petclinic-reactjs/client/package.json`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/client/webpack.config.js`
- `spring-petclinic-reactjs/client/webpack.config.prod.js`

## Extra Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/FailingApiController.java`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `frontend_entrypoint`, `unknown`
- extra predicted: `api_controller`, `service_layer`

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 6
- actual count: 5
- matched count: 0
- missed count: 5
- extra predicted count: 6

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 6
- actual count: 5
- matched count: 0
- missed count: 5
- extra predicted count: 6

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/.travis.yml`
- `spring-petclinic-reactjs/client/package.json`
- `spring-petclinic-reactjs/client/src/util/index.tsx`
- `spring-petclinic-reactjs/client/webpack.config.js`
- `spring-petclinic-reactjs/client/webpack.config.prod.js`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
