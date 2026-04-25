# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `e0be3a39b6bbeced1ee94b93b4dfcf40bc9acfbb`
- target commit: `cb0504ee976720d6759b91b747ea4cd88f9ba9ab`
- prompt: #92 add some comments to switch from HSQLDB to MySQL
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 0
- actual files: 3
- matched files: 0
- missed files: 3
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

- `spring-petclinic-reactjs/pom.xml`
- `spring-petclinic-reactjs/readme.md`
- `spring-petclinic-reactjs/src/main/resources/spring/data-access.properties`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/pom.xml`
- `spring-petclinic-reactjs/readme.md`
- `spring-petclinic-reactjs/src/main/resources/spring/data-access.properties`

## Extra Predicted Files

-

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `unknown`
- extra predicted: -

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 3
- matched count: 0
- missed count: 3
- extra predicted count: 0

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 3
- matched count: 0
- missed count: 3
- extra predicted count: 0

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/pom.xml`
- `spring-petclinic-reactjs/readme.md`
- `spring-petclinic-reactjs/src/main/resources/spring/data-access.properties`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
