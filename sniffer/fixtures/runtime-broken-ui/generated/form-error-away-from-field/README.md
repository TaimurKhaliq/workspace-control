# Broken form: error away from field

Template: form-validation
Mutation: error-away-from-field
Difficulty: medium

Broken form: error away from field. This fixture intentionally violates the form-validation runtime expectation using mutation "error-away-from-field".

Expected findings:
- form_validation_issue: Required form can be submitted without validation feedback

Expected scenario failures:
- form-error-away-from-field: Empty required form shows validation feedback
