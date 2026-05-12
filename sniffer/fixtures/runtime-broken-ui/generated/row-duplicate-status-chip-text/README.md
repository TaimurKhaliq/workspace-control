# Broken row action: duplicate status text

Template: row-action
Mutation: duplicate-status-chip-text
Difficulty: medium

Broken row action: duplicate status text. This fixture intentionally violates the row-action runtime expectation using mutation "duplicate-status-chip-text".

Expected findings:
- locator_quality_issue: Repeated Open buttons have ambiguous accessible names

Expected scenario failures:
- row-duplicate-status-chip-text: Repeated row actions have unique accessible names
