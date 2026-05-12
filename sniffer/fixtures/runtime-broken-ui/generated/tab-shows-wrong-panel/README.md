# Broken tab: wrong panel appears

Template: navigation-tab
Mutation: tab-shows-wrong-panel
Difficulty: subtle

Broken tab: wrong panel appears. This fixture intentionally violates the navigation-tab runtime expectation using mutation "tab-shows-wrong-panel".

Expected findings:
- workflow_confusion: Details tab did not change content

Expected scenario failures:
- tab-shows-wrong-panel: Details tab changes visible content
