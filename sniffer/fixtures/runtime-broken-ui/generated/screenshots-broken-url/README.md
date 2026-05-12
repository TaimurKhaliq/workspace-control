# Broken screenshot evidence: artifact URL broken

Template: screenshot-evidence
Mutation: broken-screenshot-url
Difficulty: simple

Broken screenshot evidence: artifact URL broken. This fixture intentionally violates the screenshot-evidence runtime expectation using mutation "broken-screenshot-url".

Expected findings:
- product_experience_gap: Screenshot gallery lacks scenario/action context

Expected scenario failures:
- screenshots-broken-url: Screenshot gallery cards include scenario/action context
