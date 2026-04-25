# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `818529b5b10bbf2f5ef861f0439ef1d84fc69577`
- target commit: `fb644658026099b661d82241ac1cb2f1dcec09b2`
- prompt: Add some javadoc
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 0
- actual files: 2
- matched files: 0
- missed files: 2
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

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetVisitExtractor.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetVisitExtractor.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

## Extra Predicted Files

-

## Folder-Level Matches

-

## Category-Level Matches

- precision: 0.00
- recall: 0.00
- matched: -
- missed: `repository`
- extra predicted: -

## Exact File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 2
- matched count: 0
- missed count: 2
- extra predicted count: 0

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 2
- matched count: 0
- missed count: 2
- extra predicted count: 0

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetVisitExtractor.java`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
