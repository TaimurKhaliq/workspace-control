# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `1f42b7615d159bf5aef0ebe28db199f20209dffb`
- target commit: `beb46b2b3b4bec5c0be205f90e10a85ce4f471ff`
- prompt: support switching db init script at deployment
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

- `spring-petclinic-reactjs/src/main/resources/application.properties`
- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/data.sql`
- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/schema.sql`
- `spring-petclinic-reactjs/src/main/resources/db/mysql/data.sql`
- `spring-petclinic-reactjs/src/main/resources/db/mysql/schema.sql`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/src/main/resources/application.properties`
- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/data.sql`
- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/schema.sql`
- `spring-petclinic-reactjs/src/main/resources/db/mysql/data.sql`
- `spring-petclinic-reactjs/src/main/resources/db/mysql/schema.sql`

## Extra Predicted Files

-

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `migration`, `unknown`
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

- `spring-petclinic-reactjs/src/main/resources/application.properties`
- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/data.sql`
- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/schema.sql`
- `spring-petclinic-reactjs/src/main/resources/db/mysql/data.sql`
- `spring-petclinic-reactjs/src/main/resources/db/mysql/schema.sql`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
