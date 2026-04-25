# Git History Replay Eval

- repo: `spring-petclinic-reactjs`
- repo path: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- parent commit: `7f0abc4ea45a412b811295dd11b42363d3c5c9c8`
- target commit: `f710ba8915af96ffcdd96aac88205f6a15eff5d3`
- prompt: Add Layout and Welcome page
- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace

## Summary

- commands succeeded: True
- actual files: 10
- recipe helped: False (same)
- combined worse than planner: False (-)
- recipe matched files: `spring-petclinic-reactjs/client/public/index.html`, `spring-petclinic-reactjs/client/src/components/App.tsx`, `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`, `spring-petclinic-reactjs/client/src/main.tsx`
- static asset misses: 6

### Prediction Mode Summary

| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |
|---|---:|---:|---|---|---|
| planner/propose only | 4 | 4 | 1.00/0.40 | 1.00/0.80 | 1.00/1.00 |
| recipe suggestions only | 4 | 4 | 1.00/0.40 | 1.00/0.80 | 1.00/1.00 |
| combined | 4 | 4 | 1.00/0.40 | 1.00/0.80 | 1.00/1.00 |

The planner/propose, recipe-only, and combined rows are intentionally separate so recipe-assisted success is not hidden by planner-only misses.

## Command Results

| command | exit code |
|---|---:|
| `discover_architecture` | 0 |
| `analyze_feature` | 0 |
| `plan_feature` | 0 |
| `propose_changes` | 0 |
| `suggest_from_recipes` | 0 |

## Planner/Propose Predictions Only

- predicted files: 4
- matched files: 4
- missed files: 6
- extra predicted files: 0
- exact precision: 1.00
- exact recall: 0.40
- high-signal precision: 1.00
- high-signal recall: 1.00
- category precision: 1.00
- category recall: 0.80
- folder-level matched actual files: 0

## Recipe Suggestions Only

- predicted files: 4
- matched files: 4
- missed files: 6
- extra predicted files: 0
- exact precision: 1.00
- exact recall: 0.40
- high-signal precision: 1.00
- high-signal recall: 1.00
- category precision: 1.00
- category recall: 0.80
- folder-level matched actual files: 0

## Combined Predictions

- predicted files: 4
- matched files: 4
- missed files: 6
- extra predicted files: 0
- exact precision: 1.00
- exact recall: 0.40
- high-signal precision: 1.00
- high-signal recall: 1.00
- category precision: 1.00
- category recall: 0.80
- folder-level matched actual files: 0

## Recipe Suggestions

- matched recipes:
  - `petclinic_react_ui_shell_layout` (ui_shell_layout, structural=0.98, planner=0.00)
    - why: matched recipe trigger terms: layout, page, welcome; source graph contains related domain token(s): welcome; request mentions UI shell, layout, welcome, or landing-page work

- suggested actions:
  - `spring-petclinic-reactjs/client/src/components/App.tsx` (modify, high, node=app_shell, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/main.tsx` (inspect, medium, node=frontend_entrypoint, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx` (modify, high, node=landing_page, exists_in_parent=True, matched_actual=exact)
  - `spring-petclinic-reactjs/client/public/index.html` (inspect, medium, node=public_html, exists_in_parent=True, matched_actual=exact)

## Planner/Propose Predicted Files

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

## Planner/Propose Matched Files

- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Recipe Suggestions Matched Files

- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Combined Matched Files

- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Planner/Propose Missed Files

- `spring-petclinic-reactjs/client/public/images/favicon.png`
- `spring-petclinic-reactjs/client/public/images/pets.png`
- `spring-petclinic-reactjs/client/public/images/platform-bg.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow-mobile.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow.png`
- `spring-petclinic-reactjs/client/public/images/spring-pivotal-logo.png`

## Planner/Propose Extra Predicted Files

-

## Planner/Propose Folder-Level Matches

-

## Planner/Propose Category-Level Matches

- precision: 1.00
- recall: 0.80
- matched: `app_shell`, `frontend_entrypoint`, `landing_page`, `public_html`
- missed: `static_asset`
- extra predicted: -

## Planner/Propose Exact File Scoring

- precision: 1.00
- recall: 0.40
- predicted count: 4
- actual count: 10
- matched count: 4
- missed count: 6
- extra predicted count: 0

## Planner/Propose High-Signal File Scoring

- precision: 1.00
- recall: 1.00
- predicted count: 4
- actual count: 4
- matched count: 4
- missed count: 0
- extra predicted count: 0

## Planner/Propose High-Signal Matched Files

- `spring-petclinic-reactjs/client/public/index.html`
- `spring-petclinic-reactjs/client/src/components/App.tsx`
- `spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`
- `spring-petclinic-reactjs/client/src/main.tsx`

## Planner/Propose High-Signal Missed Files

-

## Static Asset Misses

- `spring-petclinic-reactjs/client/public/images/favicon.png`
- `spring-petclinic-reactjs/client/public/images/pets.png`
- `spring-petclinic-reactjs/client/public/images/platform-bg.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow-mobile.png`
- `spring-petclinic-reactjs/client/public/images/spring-logo-dataflow.png`
- `spring-petclinic-reactjs/client/public/images/spring-pivotal-logo.png`

## Candidate Commit Helper

Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.
