# Broken copy: copies wrong text

Template: copy-export
Mutation: copy-copies-wrong-text
Difficulty: subtle

Broken copy: copies wrong text. This fixture intentionally violates the copy-export runtime expectation using mutation "copy-copies-wrong-text".

Expected findings:
- copy_action_failure: Copy action does not provide success feedback

Expected scenario failures:
- copy-copies-wrong-text: Copy action provides success feedback
