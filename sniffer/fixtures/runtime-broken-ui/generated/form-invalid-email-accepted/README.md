# Broken form: invalid email accepted

Template: form-validation
Mutation: invalid-email-accepted
Difficulty: subtle

Broken form: invalid email accepted. This fixture intentionally violates the form-validation runtime expectation using mutation "invalid-email-accepted".

Expected findings:
- form_validation_issue: Required form can be submitted without validation feedback

Expected scenario failures:
- form-invalid-email-accepted: Empty required form shows validation feedback
