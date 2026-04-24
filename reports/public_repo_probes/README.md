# Public Repository Probes

Run `python3 scripts/run_public_repo_probe.py` to clone configured public repositories into `eval_repos/`, register local discovery targets, and save read-only probe reports here.

The probe does not edit cloned target repositories. Existing clones are reused unless removed manually.

Each probe runs discovery, bootstraps deterministic inferred metadata, then runs analyze/plan/propose. Repos without `stackpilot.yml` are labeled `inferred-metadata` in `bootstrap_profile.json` and `summary.md`.
