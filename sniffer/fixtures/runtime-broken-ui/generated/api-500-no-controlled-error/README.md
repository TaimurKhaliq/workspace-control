# Broken API: 500 without controlled error

Template: api-loading
Mutation: api-500-without-controlled-error
Difficulty: simple

Broken API: 500 without controlled error. This fixture intentionally violates the api-loading runtime expectation using mutation "api-500-without-controlled-error".

Expected findings:
- api_error: API request returns 500 during runtime flow

Expected scenario failures:
- api-500-no-controlled-error: API failures show controlled error state
