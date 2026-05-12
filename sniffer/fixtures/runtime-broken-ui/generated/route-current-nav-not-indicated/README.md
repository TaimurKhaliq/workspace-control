# Broken route: current nav not indicated

Template: route-link
Mutation: current-nav-not-indicated
Difficulty: subtle

Broken route: current nav not indicated. This fixture intentionally violates the route-link runtime expectation using mutation "current-nav-not-indicated".

Expected findings:
- broken_navigation: Navigation link opens a missing route

Expected scenario failures:
- route-current-nav-not-indicated: Missing page link reaches a valid route
