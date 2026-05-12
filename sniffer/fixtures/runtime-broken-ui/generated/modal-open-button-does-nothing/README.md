# Broken modal: open button does nothing

Template: modal-dialog
Mutation: open-button-does-nothing
Difficulty: simple

Broken modal: open button does nothing. This fixture intentionally violates the modal-dialog runtime expectation using mutation "open-button-does-nothing".

Expected findings:
- broken_interaction: Add item button does not open modal

Expected scenario failures:
- modal-open-button-does-nothing: Add item opens a modal dialog
