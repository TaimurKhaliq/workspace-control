# Runtime exception: async handler throws

Template: runtime-exception
Mutation: async-handler-throws
Difficulty: medium

Runtime exception: async handler throws. This fixture intentionally violates the runtime-exception runtime expectation using mutation "async-handler-throws".

Expected findings:
- console_error: Runtime exception after click

Expected scenario failures:
- runtime-async-handler-throws: Click action does not throw runtime exception
