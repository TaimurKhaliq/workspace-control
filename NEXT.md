# Next Session

Known good:
- CLI planner varies by prompt.
- CLI semantic planner works for pet photo upload.
- Sniffer can discover UI source intent.
- Sniffer can crawl runtime UI.
- Sniffer can group issues into repair groups.
- Sniffer can generate fix packets.

Needs verification:
- UI plan-bundle path uses semantic enrichment consistently.
- Sniffer apply-fix actually invokes Codex and records repair_attempts.
- API workspace curl test was confusing because wrong workspace id was used.

Next steps:
1. Verify UI semantic wiring via browser Network tab, not curl.
2. Test Sniffer apply-fix manual mode.
3. Test Sniffer apply-fix codex mode.
4. Rerun Sniffer audit after fix.
