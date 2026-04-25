import json
import subprocess
import sys
from pathlib import Path

from scripts import run_public_repo_probe as probe

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_repo_name_from_url_supports_https_and_git_suffix() -> None:
    assert (
        probe.repo_name_from_url("https://github.com/spring-petclinic/spring-petclinic-reactjs.git")
        == "spring-petclinic-reactjs"
    )
    assert (
        probe.repo_name_from_url("git@github.com:senolatac/react-springboot-microservices.git")
        == "react-springboot-microservices"
    )


def test_prompt_slug_is_stable_and_filename_safe() -> None:
    assert (
        probe.prompt_slug("When a user updates their preferred language, publish an event!")
        == "when_a_user_updates_their_preferred_language_publish_an_event"
    )


def test_load_probe_config_validates_lists(tmp_path: Path) -> None:
    config_path = tmp_path / "public_probe.json"
    config_path.write_text(
        json.dumps(
            {
                "repos": ["https://github.com/example/project"],
                "prompts": ["Add a setting"],
            }
        ),
        encoding="utf-8",
    )

    assert probe.load_probe_config(config_path) == {
        "repos": ["https://github.com/example/project"],
        "prompts": ["Add a setting"],
    }


def test_register_local_target_writes_sorted_registry(tmp_path: Path) -> None:
    registry_path = tmp_path / "registry.json"

    probe.register_local_target(
        registry_path,
        target_id="public-zeta",
        locator=tmp_path / "zeta",
        ref=None,
        hints={"repo_url": "https://example.com/zeta", "shadow_mode": "true"},
    )
    probe.register_local_target(
        registry_path,
        target_id="public-alpha",
        locator=tmp_path / "alpha",
        ref="main",
        hints={"repo_url": "https://example.com/alpha"},
    )

    payload = json.loads(registry_path.read_text(encoding="utf-8"))
    assert [target["id"] for target in payload["targets"]] == [
        "public-alpha",
        "public-zeta",
    ]
    assert payload["targets"][0]["source_type"] == "local_path"
    assert payload["targets"][0]["locator"] == str((tmp_path / "alpha").resolve())


def test_run_public_repo_probe_writes_reports_without_network(
    tmp_path: Path, monkeypatch
) -> None:
    def fake_clone_or_reuse_repo(repo_url: str, clone_dir: Path) -> str:
        clone_dir.mkdir(parents=True)
        (clone_dir / ".git").mkdir()
        return "cloned-depth-1"

    def fake_run_cli_command(args, *, python_executable: str):
        command = args[0]
        if command == "discover-architecture":
            stdout = "discovery output\n"
        elif command == "bootstrap-repo-profile":
            stdout = '{"profiles": [{"metadata_mode": "inferred-metadata"}]}\n'
        else:
            stdout = "{}\n"
        return {
            "command": probe.display_command(args),
            "exit_code": 0,
            "stdout": stdout,
            "stderr": "",
        }

    monkeypatch.setattr(probe, "clone_or_reuse_repo", fake_clone_or_reuse_repo)
    monkeypatch.setattr(probe, "run_cli_command", fake_run_cli_command)

    report = probe.run_public_repo_probe(
        repo_urls=["https://github.com/example/project"],
        prompts=["Add preferred language to the profile screen and persist it"],
        eval_root=tmp_path / "eval_repos",
        report_root=tmp_path / "reports",
        registry_path=tmp_path / "registry.json",
        python_executable=sys.executable,
    )

    report_dir = tmp_path / "reports" / "project"
    slug = "add_preferred_language_to_the_profile_screen_and_persist_it"

    assert report["summary"] == {
        "total_repos": 1,
        "passed_repos": 1,
        "failed_repos": [],
    }
    assert (report_dir / "discovery.txt").read_text(encoding="utf-8") == "discovery output\n"
    assert json.loads(
        (report_dir / "bootstrap_profile.json").read_text(encoding="utf-8")
    ) == {"profiles": [{"metadata_mode": "inferred-metadata"}]}
    assert json.loads((report_dir / f"plan_{slug}.json").read_text(encoding="utf-8")) == {}
    assert json.loads((report_dir / f"propose_{slug}.json").read_text(encoding="utf-8")) == {}
    assert "shadow mode: read-only" in (report_dir / "summary.md").read_text(
        encoding="utf-8"
    )
    assert "metadata modes: inferred-metadata" in (report_dir / "summary.md").read_text(
        encoding="utf-8"
    )


def test_replay_git_history_eval_candidate_help() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts" / "replay_git_history_eval.py"),
            "--candidate-help",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0
    assert completed.stderr == ""
    assert "How to find candidate commits" in completed.stdout
    assert "git -C /path/to/repo log --oneline" in completed.stdout
