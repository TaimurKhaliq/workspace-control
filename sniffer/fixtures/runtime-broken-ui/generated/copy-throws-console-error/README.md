# Broken copy: console error

Template: copy-export
Mutation: copy-throws-console-error
Difficulty: simple

Broken copy: console error. This fixture intentionally violates the copy-export runtime expectation using mutation "copy-throws-console-error".

Expected findings:
- copy_action_failure: Copy action throws a console error

Expected scenario failures:
- copy-throws-console-error: Copy action provides success feedback
