import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Workspace,
  RepoTarget,
  PlanBundle,
  addRepo,
  createWorkspace,
  discoverRepo,
  generatePlanBundle,
  learningStatus,
  listRepos,
  refreshLearning,
  listWorkspaces
} from './api';

const DEFAULT_PROMPT = 'Add OwnersPage (no actions yet)';

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [repos, setRepos] = useState<RepoTarget[]>([]);
  const [workspaceName, setWorkspaceName] = useState('PetClinic local');
  const [repoTargetId, setRepoTargetId] = useState('petclinic-react');
  const [sourceType, setSourceType] = useState<'local_path' | 'git_url'>('local_path');
  const [locator, setLocator] = useState('eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs');
  const [featureRequest, setFeatureRequest] = useState(DEFAULT_PROMPT);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [planBundle, setPlanBundle] = useState<PlanBundle | null>(null);
  const [runId, setRunId] = useState('');
  const [recipeCounts, setRecipeCounts] = useState<Record<string, number>>({});
  const [learningStates, setLearningStates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void refreshWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedWorkspaceId) {
      void refreshRepos(selectedWorkspaceId);
    } else {
      setRepos([]);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const first = repos[0]?.target_id ?? '';
    if (!selectedTargetId || !repos.some((repo) => repo.target_id === selectedTargetId)) {
      setSelectedTargetId(first);
    }
    repos.forEach((repo) => {
      void learningStatus(repo.target_id)
        .then((status) => {
          setRecipeCounts((current) => ({ ...current, [repo.target_id]: status.recipe_count }));
          setLearningStates((current) => ({ ...current, [repo.target_id]: status.status }));
        })
        .catch(() => undefined);
    });
  }, [repos, selectedTargetId]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  );

  async function runTask<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError('');
    try {
      return await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusy('');
    }
  }

  async function refreshWorkspaces() {
    const rows = await runTask('Loading workspaces', listWorkspaces);
    if (!rows) return;
    setWorkspaces(rows);
    if (!selectedWorkspaceId && rows.length > 0) {
      setSelectedWorkspaceId(rows[0].id);
    }
  }

  async function refreshRepos(workspaceId: string) {
    const rows = await runTask('Loading repos', () => listRepos(workspaceId));
    if (rows) setRepos(rows);
  }

  async function onCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    const workspace = await runTask('Creating workspace', () => createWorkspace(workspaceName));
    if (!workspace) return;
    setWorkspaces((current) => [...current, workspace]);
    setSelectedWorkspaceId(workspace.id);
  }

  async function onAddRepo(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    const repo = await runTask('Adding repo', () =>
      addRepo(selectedWorkspaceId, {
        target_id: repoTargetId,
        source_type: sourceType,
        locator
      })
    );
    if (!repo) return;
    setRepos((current) => [...current, repo]);
    setSelectedTargetId(repo.target_id);
  }

  async function onDiscover(targetId: string) {
    const result = await runTask('Discovering repo', () => discoverRepo(targetId));
    if (result && selectedWorkspaceId) {
      await refreshRepos(selectedWorkspaceId);
    }
  }

  async function onRefreshLearning(targetId: string) {
    const result = await runTask('Refreshing learning', () => refreshLearning(targetId));
    if (result && selectedWorkspaceId) {
      const status = await learningStatus(targetId);
      setRecipeCounts((current) => ({ ...current, [targetId]: status.recipe_count }));
      setLearningStates((current) => ({ ...current, [targetId]: status.status }));
      await refreshRepos(selectedWorkspaceId);
    }
  }

  async function onGeneratePlan(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspaceId || !selectedTargetId) return;
    const result = await runTask('Generating Plan Bundle', () =>
      generatePlanBundle(selectedWorkspaceId, featureRequest, [selectedTargetId])
    );
    if (!result) return;
    setRunId(result.run_id);
    setPlanBundle(result.plan_bundle);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Local-first StackPilot control plane</p>
          <h1>Plan before the coding agent edits.</h1>
          <p className="lede">
            Register a repo, ask for a feature, and render the Plan Bundle JSON into ownership,
            change-set, recipe, validation, and handoff prompt cards.
          </p>
        </div>
        <div className="status-orb">
          <span>{busy || 'ready'}</span>
        </div>
      </section>

      {error && <div className="error-card">{error}</div>}

      <section className="grid two">
        <Panel title="Workspace">
          <form onSubmit={onCreateWorkspace} className="stack">
            <label>
              Workspace name
              <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </label>
            <button type="submit">Create workspace</button>
          </form>
          <label>
            Select workspace
            <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}>
              <option value="">No workspace selected</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          {selectedWorkspace && <p className="muted">Active: {selectedWorkspace.name}</p>}
        </Panel>

        <Panel title="Add Repo Target">
          <form onSubmit={onAddRepo} className="stack">
            <label>
              Target id
              <input value={repoTargetId} onChange={(event) => setRepoTargetId(event.target.value)} />
            </label>
            <label>
              Source type
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as 'local_path' | 'git_url')}>
                <option value="local_path">local_path</option>
                <option value="git_url">git_url (stored only)</option>
              </select>
            </label>
            <label>
              Local path or Git URL
              <input value={locator} onChange={(event) => setLocator(event.target.value)} />
            </label>
            <button type="submit" disabled={!selectedWorkspaceId}>Add repo</button>
          </form>
        </Panel>
      </section>

      <section className="grid repo-grid">
        {repos.map((repo) => (
          <article key={repo.id} className="repo-card">
            <div>
              <h3>{repo.repo_name}</h3>
              <p>{repo.target_id}</p>
            </div>
            <div className="pill-row">
              <span>{repo.source_type}</span>
              <span>{repo.status}</span>
              <span>learning {learningStates[repo.target_id] ?? 'unknown'}</span>
              <span>{recipeCounts[repo.target_id] ?? 0} recipes</span>
            </div>
            <p className="path">{repo.locator}</p>
            <div className="button-row">
              <button onClick={() => onDiscover(repo.target_id)}>Discover</button>
              <button onClick={() => onRefreshLearning(repo.target_id)}>Refresh learning</button>
            </div>
          </article>
        ))}
      </section>

      <section className="planner-card">
        <form onSubmit={onGeneratePlan} className="stack">
          <div className="planner-head">
            <div>
              <p className="eyebrow">Prompt input</p>
              <h2>Generate a Plan Bundle</h2>
            </div>
            <select value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)}>
              <option value="">Choose target</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.target_id}>{repo.target_id}</option>
              ))}
            </select>
          </div>
          <textarea value={featureRequest} onChange={(event) => setFeatureRequest(event.target.value)} rows={4} />
          <button type="submit" disabled={!selectedWorkspaceId || !selectedTargetId}>Generate Plan Bundle</button>
        </form>
      </section>

      {runId && <p className="muted">Plan run: {runId}</p>}
      {planBundle && <PlanBundleView bundle={planBundle} />}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PlanBundleView({ bundle }: { bundle: PlanBundle }) {
  return (
    <section className="bundle">
      <div className="bundle-summary">
        <p className="eyebrow">Plan Bundle JSON renderer</p>
        <h2>{bundle.summary.title}</h2>
        <div className="pill-row">
          <span>{bundle.summary.confidence} confidence</span>
          <span>{bundle.summary.planning_mode}</span>
          <span>{bundle.summary.detected_intents.join(', ') || 'no intents'}</span>
        </div>
      </div>

      <div className="grid three">
        <InfoCard label="Primary owner" value={bundle.ownership.primary_owner ?? '-'} />
        <InfoCard label="Implementation owner" value={bundle.ownership.implementation_owner ?? '-'} />
        <InfoCard label="Domain owner" value={bundle.ownership.domain_owner ?? '-'} />
      </div>

      <section className="panel wide">
        <h2>Recommended Change Set</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Repo</th>
                <th>Path</th>
                <th>Action</th>
                <th>Confidence</th>
                <th>Source</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {bundle.recommended_change_set.map((item) => (
                <tr key={`${item.priority}-${item.path}`}>
                  <td>{item.priority}</td>
                  <td>{item.repo_name}</td>
                  <td><code>{item.path}</code></td>
                  <td>{item.action}</td>
                  <td>{item.confidence}</td>
                  <td>{item.source}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid two">
        <Panel title="Matched Recipes">
          {bundle.matched_recipes.length === 0 && <p className="muted">No recipe evidence matched.</p>}
          {bundle.matched_recipes.map((recipe) => (
            <article key={recipe.recipe_id} className="mini-card">
              <strong>{recipe.recipe_type}</strong>
              <p>{recipe.recipe_id}</p>
              <p>structural {recipe.structural_confidence.toFixed(2)} · planner {recipe.planner_effectiveness.toFixed(2)}</p>
            </article>
          ))}
        </Panel>

        <Panel title="Validation & Caveats">
          <h4>Commands</h4>
          {bundle.validation.commands.length === 0 && <p className="muted">No validation commands discovered.</p>}
          {bundle.validation.commands.map((command) => <code className="block" key={command}>{command}</code>)}
          <h4>Risks</h4>
          {bundle.risks_and_caveats.map((risk, index) => (
            <p key={`${risk.source}-${index}`} className="risk">{risk.severity}: {risk.message}</p>
          ))}
        </Panel>
      </section>

      <section className="panel wide">
        <h2>Repo Handoff Prompts</h2>
        {bundle.handoff_prompts.map((handoff) => (
          <article key={handoff.repo_name} className="handoff">
            <div className="handoff-head">
              <h3>{handoff.repo_name}</h3>
              <button onClick={() => void navigator.clipboard.writeText(handoff.prompt)}>Copy prompt</button>
            </div>
            <pre>{handoff.prompt}</pre>
          </article>
        ))}
      </section>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="info-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
