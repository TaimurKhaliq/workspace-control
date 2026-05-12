# Broken screenshot evidence: modal lacks provenance

Template: screenshot-evidence
Mutation: modal-image-lacks-provenance
Difficulty: subtle

Broken screenshot evidence: modal lacks provenance. This fixture intentionally violates the screenshot-evidence runtime expectation using mutation "modal-image-lacks-provenance".

Expected findings:
- product_experience_gap: Screenshot gallery lacks scenario/action context

Expected scenario failures:
- screenshots-modal-no-provenance: Screenshot gallery cards include scenario/action context
