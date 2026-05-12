# Broken copy: no success feedback

Template: copy-export
Mutation: copy-no-success-feedback
Difficulty: medium

Broken copy: no success feedback. This fixture intentionally violates the copy-export runtime expectation using mutation "copy-no-success-feedback".

Expected findings:
- copy_action_failure: Copy action does not provide success feedback

Expected scenario failures:
- copy-no-success-feedback: Copy action provides success feedback
