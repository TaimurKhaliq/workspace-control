# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `7f0abc4ea45a412b811295dd11b42363d3c5c9c8`
- target commit: `f710ba8915af96ffcdd96aac88205f6a15eff5d3`
- prompt: Add Layout and Welcome page
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- predicted files: 4
- actual files: 10
- matched files: 4
- missed files: 6
- extra predicted files: 0
- precision: 1.00
- recall: 0.40

## Command Results

| command | exit code |
|---|---:|
| `discover_architecture` | 0 |
| `analyze_feature` | 0 |
| `plan_feature` | 0 |
| `propose_changes` | 0 |

## Predicted Files

- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Actual Files

- `spring-petclinic-reactjs/client/public/images/favicon.png`
- `spring-petclinic-reactjs/client/public/images/pets.png`
- `spring-petclinic-reactjs/client/public/images/platform-bg.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow-mobile.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow.png`
- `spring-petclinic-reactjs/client/public/images/spring-pivotal-logo.png`
- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Matched Files

- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Missed Files

- `spring-petclinic-reactjs/client/public/images/favicon.png`
- `spring-petclinic-reactjs/client/public/images/pets.png`
- `spring-petclinic-reactjs/client/public/images/platform-bg.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow-mobile.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow.png`
- `spring-petclinic-reactjs/client/public/images/spring-pivotal-logo.png`

## Extra Predicted Files

-

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
