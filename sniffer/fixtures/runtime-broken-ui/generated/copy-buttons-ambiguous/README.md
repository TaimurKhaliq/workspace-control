# Broken copy: multiple ambiguous copy buttons

Template: copy-export
Mutation: multiple-copy-buttons-ambiguous
Difficulty: medium

Broken copy: multiple ambiguous copy buttons. This fixture intentionally violates the copy-export runtime expectation using mutation "multiple-copy-buttons-ambiguous".

Expected findings:
- copy_action_failure: Copy action does not provide success feedback

Expected scenario failures:
- copy-buttons-ambiguous: Copy action provides success feedback
