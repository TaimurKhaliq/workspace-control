# Broken tab: click does nothing

Template: navigation-tab
Mutation: tab-click-does-nothing
Difficulty: simple

Broken tab: click does nothing. This fixture intentionally violates the navigation-tab runtime expectation using mutation "tab-click-does-nothing".

Expected findings:
- workflow_confusion: Details tab did not change content

Expected scenario failures:
- tab-click-does-nothing: Details tab changes visible content
