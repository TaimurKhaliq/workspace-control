# Broken modal: save hangs before dialog appears

Template: modal-dialog
Mutation: save-hangs
Difficulty: medium

Broken modal: save hangs before dialog appears. This fixture intentionally violates the modal-dialog runtime expectation using mutation "save-hangs".

Expected findings:
- broken_interaction: Add item button does not open modal

Expected scenario failures:
- modal-save-hangs: Add item opens a modal dialog
