# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `df4e3a5541be895ff479c5a1e851f300cd8f8881`
- target commit: `e7f68999bfa947cfb39601502da8c15e83285196`
- prompt: owners search has been case insensitive
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 0
- actual files: 1
- matched files: 0
- missed files: 1
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
| `suggest_from_recipes` | 0 |

## Planner/Propose Predictions Only

- predicted files: 0
- matched files: 0
- missed files: 1
- extra predicted files: 0
- exact precision: 0.00
- exact recall: 0.00
- high-signal precision: 0.00
- high-signal recall: 0.00
- category precision: 0.00
- category recall: 0.00
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 7
- matched files: 1
- missed files: 0
- extra predicted files: 6
- exact precision: 0.14
- exact recall: 1.00
- high-signal precision: 0.14
- high-signal recall: 1.00
- category precision: 0.25
- category recall: 1.00
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 7
- matched files: 1
- missed files: 0
- extra predicted files: 6
- exact precision: 0.14
- exact recall: 1.00
- high-signal precision: 0.14
- high-signal recall: 1.00
- category precision: 0.25
- category recall: 1.00
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_backend_search_query` (backend_search_query, structural=0.71, planner=0.00)
    - why: matched recipe trigger terms: case, insensitive, owners, query, search; source graph contains related domain token(s): owner, owners, query, search; request mentions search/query behavior

- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` (modify, high, node=repository, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java` (modify, high, node=repository, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jpa/JpaOwnerRepositoryImpl.java` (modify, high, node=repository, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql` (modify, high, node=migration, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (modify, medium, node=service_layer, exists_in_parent=True, matched_actual=no)
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (inspect, medium, node=api_controller, exists_in_parent=True, matched_actual=no)

## Predicted Files

-

## Actual Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## Extra Predicted Files

-

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `migration`
- extra predicted: -

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 0

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 1
- matched count: 0
- missed count: 1
- extra predicted count: 0

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
