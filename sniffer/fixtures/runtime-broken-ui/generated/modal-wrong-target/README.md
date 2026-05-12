# Broken modal: opens wrong target

Template: modal-dialog
Mutation: wrong-target
Difficulty: medium

Broken modal: opens wrong target. This fixture intentionally violates the modal-dialog runtime expectation using mutation "wrong-target".

Expected findings:
- broken_interaction: Add item button does not open modal

Expected scenario failures:
- modal-wrong-target: Add item opens a modal dialog
