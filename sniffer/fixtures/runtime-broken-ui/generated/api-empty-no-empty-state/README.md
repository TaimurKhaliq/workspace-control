# Broken API: empty response lacks empty state

Template: api-loading
Mutation: empty-response-no-empty-state
Difficulty: medium

Broken API: empty response lacks empty state. This fixture intentionally violates the api-loading runtime expectation using mutation "empty-response-no-empty-state".

Expected findings:
- controlled_error_state_missing: API failure lacks controlled error state

Expected scenario failures:
- api-empty-no-empty-state: API failures show controlled error state
