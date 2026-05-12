# Broken layout: horizontal overflow

Template: table-layout
Mutation: horizontal-overflow
Difficulty: simple

Broken layout: horizontal overflow. This fixture intentionally violates the table-layout runtime expectation using mutation "horizontal-overflow".

Expected findings:
- layout_issue: Wide table causes horizontal overflow

Expected scenario failures:
- layout-horizontal-overflow: Page does not horizontally overflow viewport
