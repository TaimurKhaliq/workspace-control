# Broken API: stale loading with content

Template: api-loading
Mutation: stale-loading-with-content
Difficulty: subtle

Broken API: stale loading with content. This fixture intentionally violates the api-loading runtime expectation using mutation "stale-loading-with-content".

Expected findings:
- loading_state_stuck: Loading state remains stuck without guidance

Expected scenario failures:
- api-stale-loading-with-content: Loading state resolves or gives guidance
