# Broken row action: non-interactive card treated as action

Template: row-action
Mutation: non-interactive-card-treated-as-action
Difficulty: subtle

Broken row action: non-interactive card treated as action. This fixture intentionally violates the row-action runtime expectation using mutation "non-interactive-card-treated-as-action".

Expected findings:
- locator_quality_issue: Repeated Open buttons have ambiguous accessible names

Expected scenario failures:
- row-card-treated-as-action: Repeated row actions have unique accessible names
