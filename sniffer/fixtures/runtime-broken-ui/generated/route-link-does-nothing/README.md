# Broken route: link does nothing

Template: route-link
Mutation: link-does-nothing
Difficulty: medium

Broken route: link does nothing. This fixture intentionally violates the route-link runtime expectation using mutation "link-does-nothing".

Expected findings:
- broken_navigation: Navigation link opens a missing route

Expected scenario failures:
- route-link-does-nothing: Missing page link reaches a valid route
