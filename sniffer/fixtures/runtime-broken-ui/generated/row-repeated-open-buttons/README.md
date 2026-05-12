# Broken row action: repeated Open buttons

Template: row-action
Mutation: repeated-open-buttons
Difficulty: medium

Broken row action: repeated Open buttons. This fixture intentionally violates the row-action runtime expectation using mutation "repeated-open-buttons".

Expected findings:
- locator_quality_issue: Repeated Open buttons have ambiguous accessible names

Expected scenario failures:
- row-repeated-open-buttons: Repeated row actions have unique accessible names
