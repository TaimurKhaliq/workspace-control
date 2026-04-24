# Demo Output

Run the end-to-end mixed-source planner/proposal showcase with:

```bash
python3 scripts/run_demo.py
```

The script registers a temporary local discovery target for
`tests/fixtures/mixed_source_stack`, then runs:

1. `discover-architecture`
2. `analyze-feature`
3. `plan-feature`
4. `propose-changes`

Output is printed to the terminal and saved to `reports/demo/latest_demo.md`.
