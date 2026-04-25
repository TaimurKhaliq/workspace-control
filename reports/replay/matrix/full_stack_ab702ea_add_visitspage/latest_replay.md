# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `42c0bd26350d948af8683b6bad54ed07932d31a1`
- target commit: `ab702ea61f64122f3818e4f45d275d510b32a75b`
- prompt: Add VisitsPage
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 0
- actual files: 5
- matched files: 0
- missed files: 5
- extra predicted files: 0
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

-

## Actual Files

- `spring-petclinic-reactjs/client/src/components/visits/PetDetails.tsx`
- `spring-petclinic-reactjs/client/src/components/visits/VisitsPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Visit.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/VisitResource.java`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/client/src/components/visits/PetDetails.tsx`
- `spring-petclinic-reactjs/client/src/components/visits/VisitsPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Visit.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/VisitResource.java`

## Extra Predicted Files

-

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `api_controller`, `domain_model`, `frontend_component`
- extra predicted: -

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 5
- matched count: 0
- missed count: 5
- extra predicted count: 0

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 5
- matched count: 0
- missed count: 5
- extra predicted count: 0

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/client/src/components/visits/PetDetails.tsx`
- `spring-petclinic-reactjs/client/src/components/visits/VisitsPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Visit.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/VisitResource.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
