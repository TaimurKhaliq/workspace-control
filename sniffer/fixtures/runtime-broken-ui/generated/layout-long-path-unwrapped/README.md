# Broken layout: long path not wrapped

Template: table-layout
Mutation: long-path-not-truncated
Difficulty: medium

Broken layout: long path not wrapped. This fixture intentionally violates the table-layout runtime expectation using mutation "long-path-not-truncated".

Expected findings:
- layout_issue: Wide table causes horizontal overflow

Expected scenario failures:
- layout-long-path-unwrapped: Page does not horizontally overflow viewport
