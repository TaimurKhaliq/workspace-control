# Broken tab: active state stale

Template: navigation-tab
Mutation: tab-active-state-stale
Difficulty: medium

Broken tab: active state stale. This fixture intentionally violates the navigation-tab runtime expectation using mutation "tab-active-state-stale".

Expected findings:
- workflow_confusion: Details tab did not change content

Expected scenario failures:
- tab-active-state-stale: Details tab changes visible content
