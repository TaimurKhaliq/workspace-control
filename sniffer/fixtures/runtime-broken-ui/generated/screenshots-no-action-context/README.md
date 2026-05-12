# Broken screenshot evidence: no action context

Template: screenshot-evidence
Mutation: cards-lack-action-context
Difficulty: medium

Broken screenshot evidence: no action context. This fixture intentionally violates the screenshot-evidence runtime expectation using mutation "cards-lack-action-context".

Expected findings:
- product_experience_gap: Screenshot gallery lacks scenario/action context

Expected scenario failures:
- screenshots-no-action-context: Screenshot gallery cards include scenario/action context
