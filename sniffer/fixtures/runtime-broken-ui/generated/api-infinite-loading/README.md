# Broken API: infinite loading

Template: api-loading
Mutation: infinite-loading
Difficulty: simple

Broken API: infinite loading. This fixture intentionally violates the api-loading runtime expectation using mutation "infinite-loading".

Expected findings:
- loading_state_stuck: Loading state remains stuck without guidance

Expected scenario failures:
- api-infinite-loading: Loading state resolves or gives guidance
