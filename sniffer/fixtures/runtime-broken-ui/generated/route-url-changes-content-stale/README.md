# Broken route: URL changes but content is stale

Template: route-link
Mutation: url-changes-content-stale
Difficulty: subtle

Broken route: URL changes but content is stale. This fixture intentionally violates the route-link runtime expectation using mutation "url-changes-content-stale".

Expected findings:
- broken_navigation: Navigation link opens a missing route

Expected scenario failures:
- route-url-changes-content-stale: Missing page link reaches a valid route
