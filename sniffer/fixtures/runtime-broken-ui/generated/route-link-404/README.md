# Broken route: link goes to 404

Template: route-link
Mutation: nav-link-goes-404
Difficulty: simple

Broken route: link goes to 404. This fixture intentionally violates the route-link runtime expectation using mutation "nav-link-goes-404".

Expected findings:
- broken_navigation: Navigation link opens a missing route

Expected scenario failures:
- route-link-404: Missing page link reaches a valid route
