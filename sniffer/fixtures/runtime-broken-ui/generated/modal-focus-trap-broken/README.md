# Broken modal: focus trap broken

Template: modal-dialog
Mutation: focus-trap-broken
Difficulty: subtle

Broken modal: focus trap broken. This fixture intentionally violates the modal-dialog runtime expectation using mutation "focus-trap-broken".

Expected findings:
- broken_interaction: Add item button does not open modal

Expected scenario failures:
- modal-focus-trap-broken: Add item opens a modal dialog
