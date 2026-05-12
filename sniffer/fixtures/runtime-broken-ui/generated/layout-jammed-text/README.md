# Broken layout: jammed text

Template: table-layout
Mutation: jammed-text
Difficulty: medium

Broken layout: jammed text. This fixture intentionally violates the table-layout runtime expectation using mutation "jammed-text".

Expected findings:
- layout_issue: Wide table causes horizontal overflow

Expected scenario failures:
- layout-jammed-text: Page does not horizontally overflow viewport
