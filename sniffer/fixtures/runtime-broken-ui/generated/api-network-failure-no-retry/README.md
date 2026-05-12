# Broken API: network failure without retry

Template: api-loading
Mutation: network-failure-no-retry
Difficulty: simple

Broken API: network failure without retry. This fixture intentionally violates the api-loading runtime expectation using mutation "network-failure-no-retry".

Expected findings:
- api_error: API request returns 500 during runtime flow

Expected scenario failures:
- api-network-failure-no-retry: API failures show controlled error state
