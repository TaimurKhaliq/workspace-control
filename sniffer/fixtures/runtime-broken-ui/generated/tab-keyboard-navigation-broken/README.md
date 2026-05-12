# Broken tab: keyboard navigation broken

Template: navigation-tab
Mutation: tab-keyboard-navigation-broken
Difficulty: medium

Broken tab: keyboard navigation broken. This fixture intentionally violates the navigation-tab runtime expectation using mutation "tab-keyboard-navigation-broken".

Expected findings:
- workflow_confusion: Details tab did not change content

Expected scenario failures:
- tab-keyboard-navigation-broken: Details tab changes visible content
