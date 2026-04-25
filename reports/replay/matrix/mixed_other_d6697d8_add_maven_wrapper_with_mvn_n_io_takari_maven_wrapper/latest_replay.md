# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `3a9e0f3f120ba14888e19cec0b17954786af07e3`
- target commit: `d6697d8853d97645dfa28cbe024425737cabb43d`
- prompt: Add Maven Wrapper with mvn -N io.takari:maven:wrapper
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 0
- actual files: 4
- matched files: 0
- missed files: 4
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

- `spring-petclinic-reactjs/.gitignore`
- `spring-petclinic-reactjs/mvnw`
- `spring-petclinic-reactjs/mvnw.cmd`
- `spring-petclinic-reactjs/readme.md`

## Matched Files

-

## Missed Files

- `spring-petclinic-reactjs/.gitignore`
- `spring-petclinic-reactjs/mvnw`
- `spring-petclinic-reactjs/mvnw.cmd`
- `spring-petclinic-reactjs/readme.md`

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
- actual count: 4
- matched count: 0
- missed count: 4
- extra predicted count: 0

## High-Signal File Scoring

- precision: 0.00
- recall: 0.00
- predicted count: 0
- actual count: 4
- matched count: 0
- missed count: 4
- extra predicted count: 0

## High-Signal Matched Files

-

## High-Signal Missed Files

- `spring-petclinic-reactjs/.gitignore`
- `spring-petclinic-reactjs/mvnw`
- `spring-petclinic-reactjs/mvnw.cmd`
- `spring-petclinic-reactjs/readme.md`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
