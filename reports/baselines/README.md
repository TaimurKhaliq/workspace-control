# Eval Baselines

Save a named copy of the latest green eval report with:

```bash
python3 scripts/save_baseline.py --name green_14_case_baseline
```

The script copies `reports/latest_eval.json` and `reports/latest_eval.md` into
`reports/baselines/<baseline_name>/` and writes `metadata.json` with the baseline
name, timestamp, eval counts, and current git commit SHA when available.

The latest eval report must be green (`failed = 0`) before a baseline can be saved.
