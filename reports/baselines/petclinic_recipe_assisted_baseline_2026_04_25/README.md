# petclinic_recipe_assisted_baseline_2026_04_25

- baseline name: `petclinic_recipe_assisted_baseline_2026_04_25`
- created at: `2026-04-25T22:54:40+00:00`
- target id: `petclinic-react`
- repo name: `spring-petclinic-reactjs`
- git commit: `a9402c29f3a9224d05884a343900896a82e15d82`
- eval suite: 14/14 passed, failed=0
- replay matrix: 8/8 succeeded, failed=0
- recipe helped cases: `5`
- combined worse than planner cases: `0`
- combined high-signal recall: `0.7216`

## Key Proof Points

- UI shell replay predicts high-signal files for `Add Layout and Welcome page`.
- UI page-add replay predicts `OwnersPage`, route config, and frontend types.
- Backend search recipe recovers `initDB.sql` for case-insensitive owner search.
- UI form validation recipe recovers `NewOwnerPage` for invalid-field feedback.
- Combined recommendations improve recall while avoiding cases where combined is worse than planner.

## Copied Artifacts

- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/latest_matrix.md`
- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/latest_matrix.json`
- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/latest_learning.md`
- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/latest_learning.json`
- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/latest_eval.md`
- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/latest_eval.json`
- `reports/baselines/petclinic_recipe_assisted_baseline_2026_04_25/petclinic_auto_replay_cases.json`

## Missing Optional Artifacts

- none
