# Broken row action: repeated Reopen buttons

Template: row-action
Mutation: repeated-reopen-buttons
Difficulty: medium

Broken row action: repeated Reopen buttons. This fixture intentionally violates the row-action runtime expectation using mutation "repeated-reopen-buttons".

Expected findings:
- locator_quality_issue: Repeated Open buttons have ambiguous accessible names

Expected scenario failures:
- row-repeated-reopen-buttons: Repeated row actions have unique accessible names
