# Broken form: submit disabled with no reason

Template: form-validation
Mutation: submit-disabled-no-reason
Difficulty: medium

Broken form: submit disabled with no reason. This fixture intentionally violates the form-validation runtime expectation using mutation "submit-disabled-no-reason".

Expected findings:
- form_validation_issue: Required form can be submitted without validation feedback

Expected scenario failures:
- form-disabled-no-reason: Empty required form shows validation feedback
