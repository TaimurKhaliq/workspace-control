# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `d2017b8f57050830ec8980f7b578eb272c66af67`
- target commit: `0a36a33c0101b3aad023dbc7a6ebe440755af968`
- prompt: Add OwnersPage (no actions yet)
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 5
- actual files: 3
- matched files: 3
- missed files: 0
- extra predicted files: 2
- exact file precision: 0.60
- exact file recall: 1.00
- folder-level matched actual files: 0
- category precision: 1.00
- category recall: 1.00
- high-signal exact precision: 0.60
- high-signal exact recall: 1.00
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
- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/types.ts`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Actual Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## Missed Files

-

## Extra Predicted Files

- `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/components/owners/types.ts`

## Folder-Level Matches

-

## Category-Level Matches

- precision: 1.00
- recall: 1.00
- matched: `frontend_component`, `frontend_type`
- missed: -
- extra predicted: -

## Exact File Scoring

- precision: 0.60
- recall: 1.00
- predicted count: 5
- actual count: 3
- matched count: 3
- missed count: 0
- extra predicted count: 2

## High-Signal File Scoring

- precision: 0.60
- recall: 1.00
- predicted count: 5
- actual count: 3
- matched count: 3
- missed count: 0
- extra predicted count: 2

## High-Signal Matched Files

- `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`
- `spring-petclinic-reactjs/client/src/configureRoutes.tsx`
- `spring-petclinic-reactjs/client/src/types/index.ts`

## High-Signal Missed Files

-

## Static Asset Misses

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
