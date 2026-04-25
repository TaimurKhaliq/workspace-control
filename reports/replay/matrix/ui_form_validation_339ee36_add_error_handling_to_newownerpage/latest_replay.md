# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `49ca65bd235ce802df7a92dc167f4873f0d2786b`
- target commit: `339ee36d7da27221aba4866cc2ee91c6e96d4746`
- prompt: Add error handling to NewOwnerPage
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 3
- actual files: 3
- matched files: 2
- missed files: 1
- extra predicted files: 1
- exact file precision: 0.67
- exact file recall: 0.67
- folder-level matched actual files: 0
- category precision: 1.00
- category recall: 0.50
- high-signal exact precision: 0.67
- high-signal exact recall: 0.67
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

## Actual Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## Missed Files

- `spring-petclinic-reactjs/client/src/types/index.ts`

## Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 1.00
- recall: 0.50
- matched: `frontend_component`
- missed: `frontend_type`
- extra predicted: -

## Exact File Scoring

- precision: 0.67
- recall: 0.67
- predicted count: 3
- actual count: 3
- matched count: 2
- missed count: 1
- extra predicted count: 1

## High-Signal File Scoring

- precision: 0.67
- recall: 0.67
- predicted count: 3
- actual count: 3
- matched count: 2
- missed count: 1
- extra predicted count: 1

## High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`

## High-Signal Missed Files

- `spring-petclinic-reactjs/client/src/types/index.ts`

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
