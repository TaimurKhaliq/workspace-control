# Broken screenshot evidence: filenames only

Template: screenshot-evidence
Mutation: gallery-filenames-only
Difficulty: medium

Broken screenshot evidence: filenames only. This fixture intentionally violates the screenshot-evidence runtime expectation using mutation "gallery-filenames-only".

Expected findings:
- product_experience_gap: Screenshot gallery lacks scenario/action context

Expected scenario failures:
- screenshots-filenames-only: Screenshot gallery cards include scenario/action context
