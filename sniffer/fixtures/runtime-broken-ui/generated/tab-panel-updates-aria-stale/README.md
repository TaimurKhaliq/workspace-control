# Broken tab: aria-selected does not update

Template: navigation-tab
Mutation: tab-panel-updates-aria-stale
Difficulty: subtle

Broken tab: aria-selected does not update. This fixture intentionally violates the navigation-tab runtime expectation using mutation "tab-panel-updates-aria-stale".

Expected findings:
- workflow_confusion: Details tab did not change content

Expected scenario failures:
- tab-panel-updates-aria-stale: Details tab changes visible content
