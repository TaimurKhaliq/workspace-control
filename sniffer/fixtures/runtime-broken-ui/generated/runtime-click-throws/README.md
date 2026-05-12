# Runtime exception: click throws

Template: runtime-exception
Mutation: click-throws
Difficulty: simple

Runtime exception: click throws. This fixture intentionally violates the runtime-exception runtime expectation using mutation "click-throws".

Expected findings:
- console_error: Runtime exception after click

Expected scenario failures:
- runtime-click-throws: Click action does not throw runtime exception
