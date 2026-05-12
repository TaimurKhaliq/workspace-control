# Broken form: required submit has no validation

Template: form-validation
Mutation: required-submit-no-validation
Difficulty: simple

Broken form: required submit has no validation. This fixture intentionally violates the form-validation runtime expectation using mutation "required-submit-no-validation".

Expected findings:
- form_validation_issue: Required form can be submitted without validation feedback

Expected scenario failures:
- form-required-no-validation: Empty required form shows validation feedback
