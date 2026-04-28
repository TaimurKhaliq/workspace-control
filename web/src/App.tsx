import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Workspace,
  RepoTarget,
  PlanBundle,
  PlanBundleChangeItem,
  PlanRun,
  addRepo,
  createWorkspace,
  discoverRepo,
  generatePlanBundle,
  getPlanRun,
  getSemanticStatus,
  learningStatus,
  listRepos,
  listPlanRuns,
  resetLocalData,
  refreshLearning,
  listWorkspaces,
  validateRepoTarget,
  RepoTargetValidation,
  SemanticStatus
} from './api';

const DEFAULT_PROMPT = 'Add OwnersPage (no actions yet)';
const RECENT_PATHS_KEY = 'stackpilot.recentRepoPaths';

type PlanTab = 'overview' | 'changes' | 'recipes' | 'graph' | 'validation' | 'handoff' | 'json';
type SourceFilter = 'all' | 'planner' | 'recipe' | 'semantic_enrichment' | 'both';
type ActionFilter = 'all' | 'modify' | 'create' | 'inspect' | 'inspect-only';
type SectionFilter = 'all' | 'frontend' | 'backend' | 'api' | 'persistence' | 'config' | 'unknown';
type AppPage = 'workspaces' | 'repositories' | 'plan-runs' | 'learning' | 'settings';
type PlanRunSemanticContext = {
  requested: boolean;
  sent: boolean;
  status: SemanticStatus | null;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<{ name: string }>;
};

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [repos, setRepos] = useState<RepoTarget[]>([]);
  const [planRuns, setPlanRuns] = useState<PlanRun[]>([]);
  const [activePage, setActivePage] = useState<AppPage>('plan-runs');
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
  const [repoValidation, setRepoValidation] = useState<RepoTargetValidation | null>(null);
  const [repoValidationBusy, setRepoValidationBusy] = useState(false);
  const [repoValidationError, setRepoValidationError] = useState('');
  const [repoValidations, setRepoValidations] = useState<Record<string, RepoTargetValidation>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [repoModalOpen, setRepoModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [activePlanTab, setActivePlanTab] = useState<PlanTab>('overview');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [selectedChange, setSelectedChange] = useState<PlanBundleChangeItem | null>(null);
  const [recentPaths, setRecentPaths] = useState<string[]>(() => loadRecentPaths());
  const [folderPickerNote, setFolderPickerNote] = useState('');
  const [semanticStatus, setSemanticStatus] = useState<SemanticStatus | null>(null);
  const [useSemantic, setUseSemantic] = useState(false);
  const [lastRunSemantic, setLastRunSemantic] = useState<PlanRunSemanticContext>({
    requested: false,
    sent: false,
    status: null
  });
  const [planStatusMessage, setPlanStatusMessage] = useState('Ready for generating Plan Bundles.');
  const planRequestId = useRef(0);
  const planAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    void refreshWorkspaces();
  }, []);

  useEffect(() => {
    void getSemanticStatus(selectedTargetId || undefined)
      .then((status) => {
        setSemanticStatus(status);
        if (!status.available) setUseSemantic(false);
      })
      .catch(() => {
        setSemanticStatus({
          configured: false,
          provider: null,
          model: null,
          api_style: 'auto',
          cached_artifact_available: false,
          available: false
        });
        setUseSemantic(false);
      });
  }, [selectedTargetId]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      void refreshRepos(selectedWorkspaceId);
      void refreshPlanRuns(selectedWorkspaceId);
    } else {
      setRepos([]);
      setPlanRuns([]);
    }
    setPlanBundle(null);
    setRunId('');
    setSelectedChange(null);
    setActivePlanTab('overview');
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

  useEffect(() => {
    if (!locator.trim()) {
      setRepoValidation(null);
      setRepoValidationBusy(false);
      setRepoValidationError('');
      return;
    }
    const timeout = window.setTimeout(() => {
      setRepoValidationBusy(true);
      setRepoValidationError('');
      void validateRepoTarget({ source_type: sourceType, locator })
        .then(setRepoValidation)
        .catch((err) => {
          setRepoValidation(null);
          setRepoValidationError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setRepoValidationBusy(false));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [sourceType, locator]);

  useEffect(() => {
    repos.forEach((repo) => {
      if (repo.source_type !== 'local_path') return;
      void validateRepoTarget({ source_type: repo.source_type, locator: repo.locator })
        .then((validation) => {
          setRepoValidations((current) => ({ ...current, [repo.target_id]: validation }));
        })
        .catch(() => undefined);
    });
  }, [repos]);

  useEffect(() => {
    if (!planBundle?.recommended_change_set.length) {
      setSelectedChange(null);
      return;
    }
    setSelectedChange(planBundle.recommended_change_set[0]);
  }, [planBundle]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  );
  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.target_id === selectedTargetId) ?? null,
    [repos, selectedTargetId]
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

  async function refreshPlanRuns(workspaceId: string) {
    const rows = await runTask('Loading plan runs', () => listPlanRuns(workspaceId));
    if (rows) setPlanRuns(rows);
  }

  async function onCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    const workspace = await runTask('Creating workspace', () => createWorkspace(workspaceName));
    if (!workspace) return;
    setWorkspaces((current) => [...current, workspace]);
    setSelectedWorkspaceId(workspace.id);
    setActivePage('workspaces');
    setWorkspaceModalOpen(false);
  }

  async function onAddRepo(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    const validation = await runTask('Validating repo target', () =>
      validateRepoTarget({ source_type: sourceType, locator })
    );
    if (validation) {
      setRepoValidation(validation);
    }
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
    rememberRecentPath(locator, setRecentPaths);
    setActivePage('repositories');
    setRepoModalOpen(false);
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
    const requestedSemantic = Boolean(useSemantic);
    const semanticEnabled = Boolean(useSemantic && semanticStatus?.available);
    const requestId = planRequestId.current + 1;
    planRequestId.current = requestId;
    planAbort.current?.abort();
    const controller = new AbortController();
    planAbort.current = controller;
    setBusy('Generating Plan Bundle');
    setError('');
    setPlanBundle(null);
    setSelectedChange(null);
    setRunId('');
    setActivePlanTab('overview');
    setLastRunSemantic({ requested: requestedSemantic, sent: semanticEnabled, status: semanticStatus });
    setPlanStatusMessage('Generating a fresh Plan Bundle...');
    console.info('[StackPilot] generate plan bundle request', {
      feature_request: featureRequest,
      target_id: selectedTargetId,
      use_semantic: semanticEnabled,
      semantic_requested: requestedSemantic,
      semantic_available: semanticStatus?.available ?? false
    });
    try {
      const result = await generatePlanBundle(
        selectedWorkspaceId,
        featureRequest,
        [selectedTargetId],
        semanticEnabled,
        { signal: controller.signal }
      );
      if (requestId !== planRequestId.current) return;
      console.info('[StackPilot] generate plan bundle response', {
        feature_request: result.plan_bundle.feature_request,
        intent_labels: semanticIntentLabels(result.plan_bundle),
        summary_intents: result.plan_bundle.summary.detected_intents,
        semantic_available: Boolean(result.plan_bundle.semantic_enrichment?.available)
      });
      setRunId(result.run_id);
      setPlanBundle(result.plan_bundle);
      setPlanStatusMessage('');
      setActivePage('plan-runs');
      void refreshPlanRuns(selectedWorkspaceId);
    } catch (err) {
      if (controller.signal.aborted || requestId !== planRequestId.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setPlanStatusMessage('');
    } finally {
      if (requestId === planRequestId.current) {
        setBusy('');
        planAbort.current = null;
      }
    }
  }

  async function onReopenPlanRun(planRun: PlanRun) {
    const row = await runTask('Loading plan run', () => getPlanRun(planRun.id));
    if (!row) return;
    if (!row.plan_bundle_json) {
      setError('This plan run does not have a completed Plan Bundle to reopen.');
      return;
    }
    setRunId(row.id);
    setPlanBundle(row.plan_bundle_json);
    setFeatureRequest(row.feature_request);
    setSelectedTargetId(row.target_ids[0] ?? selectedTargetId);
    setActivePlanTab('overview');
    setSelectedChange(row.plan_bundle_json.recommended_change_set?.[0] ?? null);
    setLastRunSemantic({
      requested: Boolean(row.plan_bundle_json.semantic_enrichment?.available),
      sent: Boolean(row.plan_bundle_json.semantic_enrichment?.available),
      status: semanticStatus
    });
    setPlanStatusMessage(`Reopened plan run from ${formatDateTime(row.created_at)}.`);
    setActivePage('plan-runs');
  }

  async function onPickFolder() {
    const picker = window as DirectoryPickerWindow;
    if (!picker.showDirectoryPicker) {
      setFolderPickerNote('Browser folder picker is unavailable here. Use the manual absolute or repo-relative path input.');
      return;
    }
    const handle = await picker.showDirectoryPicker().catch(() => null);
    if (!handle) return;
    setFolderPickerNote(
      `Selected folder "${handle.name}". Browser security does not expose an absolute path, so keep using the manual path field for local-first registration.`
    );
  }

  function clearClientStateAfterReset(message: string) {
    clearStackPilotLocalStorage();
    setWorkspaces([]);
    setSelectedWorkspaceId('');
    setRepos([]);
    setPlanRuns([]);
    setSelectedTargetId('');
    setPlanBundle(null);
    setRunId('');
    setRecipeCounts({});
    setLearningStates({});
    setRepoValidation(null);
    setRepoValidations({});
    setRecentPaths([]);
    setUseSemantic(false);
    setSemanticStatus(null);
    setLastRunSemantic({ requested: false, sent: false, status: null });
    setSelectedChange(null);
    setActivePlanTab('overview');
    setActivePage('workspaces');
    setPlanStatusMessage(message);
  }

  async function onResetLocalData(confirm: string) {
    const result = await runTask('Resetting local data', () => resetLocalData(confirm));
    if (!result) return;
    setResetModalOpen(false);
    clearClientStateAfterReset(result.message);
  }

  function renderPage() {
    if (activePage === 'workspaces') {
      return (
        <WorkspacePage
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={setSelectedWorkspaceId}
          onOpenWorkspace={() => setWorkspaceModalOpen(true)}
        />
      );
    }
    if (activePage === 'repositories') {
      return (
        <PageFrame>
          <RepoList
            repos={repos}
            validations={repoValidations}
            selectedTargetId={selectedTargetId}
            recipeCounts={recipeCounts}
            learningStates={learningStates}
            busy={busy}
            onSelectRepo={setSelectedTargetId}
            onDiscover={onDiscover}
            onRefreshLearning={onRefreshLearning}
            onOpenRepo={() => setRepoModalOpen(true)}
          />
        </PageFrame>
      );
    }
    if (activePage === 'learning') {
      return (
        <LearningPage
          repos={repos}
          recipeCounts={recipeCounts}
          learningStates={learningStates}
          busy={busy}
          onRefreshLearning={onRefreshLearning}
          onDiscover={onDiscover}
        />
      );
    }
    if (activePage === 'settings') {
      return (
            <SettingsPage
              semanticStatus={semanticStatus}
              selectedRepo={selectedRepo}
              useSemantic={useSemantic}
              onUseSemanticChange={setUseSemantic}
              onOpenReset={() => setResetModalOpen(true)}
            />
      );
    }
    return (
      <section className="workflow-grid">
        <div className="work-surface">
          <PromptComposer
            featureRequest={featureRequest}
            selectedTargetId={selectedTargetId}
            repos={repos}
            runId={runId}
            busy={busy}
            semanticStatus={semanticStatus}
            useSemantic={useSemantic}
            selectedWorkspace={selectedWorkspace}
            selectedRepo={selectedRepo}
            onPromptChange={setFeatureRequest}
            onTargetChange={setSelectedTargetId}
            onUseSemanticChange={setUseSemantic}
            onSubmit={onGeneratePlan}
          />

          <PlanRunsPanel
            planRuns={planRuns}
            activeRunId={runId}
            onReopen={onReopenPlanRun}
          />

          {planBundle ? (
            <PlanBundleView
              bundle={planBundle}
              runId={runId}
              activeTab={activePlanTab}
              onTabChange={setActivePlanTab}
              sourceFilter={sourceFilter}
              actionFilter={actionFilter}
              sectionFilter={sectionFilter}
              onSourceFilterChange={setSourceFilter}
              onActionFilterChange={setActionFilter}
              onSectionFilterChange={setSectionFilter}
              selectedChange={selectedChange}
              semanticContext={lastRunSemantic}
              onSelectChange={setSelectedChange}
            />
          ) : (
            <EmptyPlanState />
          )}
        </div>

        <RightInspector bundle={planBundle} selectedChange={selectedChange} />
      </section>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        workspaces={workspaces}
        repos={repos}
        selectedWorkspaceId={selectedWorkspaceId}
        recipeCounts={recipeCounts}
        activePage={activePage}
        onSelectWorkspace={setSelectedWorkspaceId}
        onNavigate={setActivePage}
        onOpenWorkspace={() => setWorkspaceModalOpen(true)}
        onOpenRepo={() => setRepoModalOpen(true)}
      />

      <main className="workspace-main">
        <TopBar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={setSelectedWorkspaceId}
          workspace={selectedWorkspace}
          repo={selectedRepo}
          repoCount={repos.length}
          recipeCount={selectedTargetId ? recipeCounts[selectedTargetId] : undefined}
          learningState={selectedTargetId ? learningStates[selectedTargetId] : undefined}
          semanticStatus={semanticStatus}
          busy={busy}
        />
        {error && <div className="error-card" role="alert">{error}</div>}
        {planStatusMessage && <div className="status-card" role="status">{planStatusMessage}</div>}

        {renderPage()}
      </main>

      {workspaceModalOpen && (
        <WorkspaceModal
          workspaceName={workspaceName}
          onNameChange={setWorkspaceName}
          onSubmit={onCreateWorkspace}
          onClose={() => setWorkspaceModalOpen(false)}
        />
      )}

      {repoModalOpen && (
        <AddRepoModal
          repoTargetId={repoTargetId}
          sourceType={sourceType}
          locator={locator}
          validation={repoValidation}
          validationBusy={repoValidationBusy}
          validationError={repoValidationError}
          recentPaths={recentPaths}
          folderPickerNote={folderPickerNote}
          onTargetIdChange={setRepoTargetId}
          onSourceTypeChange={setSourceType}
          onLocatorChange={setLocator}
          onUseSuggestedRoot={(path) => setLocator(path)}
          onPickFolder={onPickFolder}
          onSubmit={onAddRepo}
          onClose={() => setRepoModalOpen(false)}
          disabled={!selectedWorkspaceId}
        />
      )}

      {resetModalOpen && (
        <ResetLocalDataModal
          busy={busy === 'Resetting local data'}
          onSubmit={onResetLocalData}
          onClose={() => setResetModalOpen(false)}
        />
      )}
    </div>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <section className="page-frame">{children}</section>;
}

function WorkspacePage({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspace
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenWorkspace: () => void;
}) {
  return (
    <PageFrame>
      <section className="card-panel workspace-page">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Workspaces</p>
            <h2>Choose the local planning context</h2>
          </div>
          <button data-testid="workspace-page-new-workspace-button" onClick={onOpenWorkspace}>New workspace</button>
        </div>
        {workspaces.length === 0 ? (
          <EmptyCard title="No workspaces yet" text="Create a workspace to group repo targets and Plan Bundle runs." />
        ) : (
          <div className="workspace-card-list" data-testid="workspace-page-list">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                data-testid="workspace-page-item"
                className={`workspace-card-row ${workspace.id === selectedWorkspaceId ? 'active' : ''}`}
                aria-label={`${workspace.name}. Created ${formatDate(workspace.created_at)}. ${workspace.id === selectedWorkspaceId ? 'Active workspace' : 'Available workspace'}.`}
                onClick={() => onSelectWorkspace(workspace.id)}
              >
                <span>
                  <strong>{workspace.name}</strong>
                  <small>
                    Created · {formatDate(workspace.created_at)} · {workspace.id === selectedWorkspaceId ? 'Active workspace' : 'Available workspace'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </PageFrame>
  );
}

function PlanRunsPanel({
  planRuns,
  activeRunId,
  onReopen
}: {
  planRuns: PlanRun[];
  activeRunId: string;
  onReopen: (run: PlanRun) => void;
}) {
  return (
    <section className="card-panel plan-runs-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">History</p>
          <h2>Plan Runs</h2>
        </div>
        <StatusChip label={`${planRuns.length} run${planRuns.length === 1 ? '' : 's'}`} tone={planRuns.length > 0 ? 'good' : 'muted'} />
      </div>
      {planRuns.length === 0 ? (
        <EmptyCard title="No plan runs yet" text="Generate a plan bundle to see it here." />
      ) : (
        <div className="plan-runs-list" data-testid="plan-runs-list">
          {planRuns.map((run) => (
            <article key={run.id} className={`plan-run-item ${run.id === activeRunId ? 'active' : ''}`} data-testid="plan-run-item">
              <div className="plan-run-main">
                <p className="plan-run-prompt" data-testid="plan-run-prompt">{run.feature_request}</p>
                <div className="plan-run-meta">
                  <span data-testid="plan-run-target">{run.target_ids.join(', ') || 'no target'}</span>
                  <span data-testid="plan-run-created-at">{formatDateTime(run.created_at)}</span>
                  <StatusChip label={run.status} tone={run.status === 'completed' ? 'good' : run.status === 'error' ? 'danger' : 'muted'} />
                  <span data-testid="plan-run-status" className="sr-only">{run.status}</span>
                  <StatusChip
                    label={`Semantic ${run.plan_bundle_json?.semantic_enrichment?.available ? 'On' : 'Off'}`}
                    tone={run.plan_bundle_json?.semantic_enrichment?.available ? 'good' : 'muted'}
                  />
                  <span data-testid="plan-run-semantic-chip" className="sr-only">
                    Semantic {run.plan_bundle_json?.semantic_enrichment?.available ? 'On' : 'Off'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="reopen-plan-run-button"
                className="secondary-button"
                onClick={() => onReopen(run)}
              >
                Reopen
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LearningPage({
  repos,
  recipeCounts,
  learningStates,
  busy,
  onRefreshLearning,
  onDiscover
}: {
  repos: RepoTarget[];
  recipeCounts: Record<string, number>;
  learningStates: Record<string, string>;
  busy: string;
  onRefreshLearning: (targetId: string) => void;
  onDiscover: (targetId: string) => void;
}) {
  return (
    <PageFrame>
      <section className="card-panel learning-page">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Learning</p>
            <h2>Discovery and recipe state</h2>
          </div>
        </div>
        {repos.length === 0 ? (
          <EmptyCard title="No repo targets" text="Add a repository before refreshing discovery or learning." />
        ) : (
          <div className="learning-list">
            {repos.map((repo) => (
              <article key={repo.id} className="learning-row">
                <div>
                  <strong>{repo.repo_name}</strong>
                  <p>{repo.target_id}</p>
                </div>
                <div className="chip-row">
                  <StatusChip label={`learning ${learningStates[repo.target_id] ?? 'unknown'}`} tone={learningStates[repo.target_id] === 'fresh' ? 'good' : 'muted'} />
                  <StatusChip label={`${recipeCounts[repo.target_id] ?? 0} recipes`} tone={(recipeCounts[repo.target_id] ?? 0) > 0 ? 'good' : 'muted'} />
                </div>
                <div className="repo-actions">
                  <button className="secondary-button" onClick={() => onDiscover(repo.target_id)} disabled={Boolean(busy)}>Discover</button>
                  <button className="secondary-button" onClick={() => onRefreshLearning(repo.target_id)} disabled={Boolean(busy)}>Refresh learning</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageFrame>
  );
}

function SettingsPage({
  semanticStatus,
  selectedRepo,
  useSemantic,
  onUseSemanticChange,
  onOpenReset
}: {
  semanticStatus: SemanticStatus | null;
  selectedRepo: RepoTarget | null;
  useSemantic: boolean;
  onUseSemanticChange: (value: boolean) => void;
  onOpenReset: () => void;
}) {
  const semanticAvailable = Boolean(semanticStatus?.available);
  return (
    <PageFrame>
      <section className="card-panel settings-page">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Local planner options</h2>
          </div>
        </div>
        <div className="settings-grid">
          <Metric label="Selected repo" value={selectedRepo?.target_id ?? '-'} />
          <Metric label="Semantic provider" value={semanticStatus?.provider ?? 'not configured'} />
          <Metric label="Semantic model" value={semanticStatus?.model ?? '-'} />
          <Metric label="Semantic cache" value={semanticStatus?.cached_artifact_available ? 'available' : 'missing'} />
        </div>
        <label className={`semantic-toggle ${semanticAvailable ? '' : 'disabled'}`}>
          <span>
            <input
              type="checkbox"
              aria-label="Use semantic enrichment"
              title={semanticAvailable ? 'Use semantic enrichment for generated plans.' : 'Semantic enrichment requires provider configuration or a cached target artifact.'}
              checked={useSemantic && semanticAvailable}
              disabled={!semanticAvailable}
              onChange={(event) => onUseSemanticChange(event.target.checked)}
            />
            Use semantic enrichment
          </span>
          <small>Provider and cache status are read from the backend without exposing API keys.</small>
        </label>
        <section className="danger-zone">
          <div>
            <p className="eyebrow">Danger zone</p>
            <h3>Reset local StackPilot data</h3>
            <p>
              Wipe workspaces, repo targets, plan runs, discovery registry, semantic cache, and learning cache.
              Source repos and baseline reports are not touched.
            </p>
          </div>
          <button
            type="button"
            className="danger-button"
            data-testid="reset-local-data-button"
            onClick={onOpenReset}
          >
            Reset local data
          </button>
        </section>
      </section>
    </PageFrame>
  );
}

function Sidebar({
  workspaces,
  repos,
  selectedWorkspaceId,
  recipeCounts,
  activePage,
  onSelectWorkspace,
  onNavigate,
  onOpenWorkspace,
  onOpenRepo
}: {
  workspaces: Workspace[];
  repos: RepoTarget[];
  selectedWorkspaceId: string;
  recipeCounts: Record<string, number>;
  activePage: AppPage;
  onSelectWorkspace: (id: string) => void;
  onNavigate: (page: AppPage) => void;
  onOpenWorkspace: () => void;
  onOpenRepo: () => void;
}) {
  const recipeTotal = Object.values(recipeCounts).reduce((total, count) => total + count, 0);
  const navItems: Array<[AppPage, string]> = [
    ['workspaces', 'Workspaces'],
    ['repositories', 'Repositories'],
    ['plan-runs', 'Plan Runs'],
    ['learning', 'Learning'],
    ['settings', 'Settings']
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-product">
        <div className="product-mark">SP</div>
        <div>
          <strong>StackPilot</strong>
          <span>Control Plane</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navItems.map(([page, label]) => (
          <button
            key={page}
            type="button"
            className={`nav-item ${activePage === page ? 'active' : ''}`}
            aria-current={activePage === page ? 'page' : undefined}
            onClick={() => onNavigate(page)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="sidebar-section">
        <div className="sidebar-title-row">
          <span>Workspaces</span>
          <button
            className="icon-button"
            data-testid="new-workspace-button"
            onClick={onOpenWorkspace}
            title="New workspace"
            aria-label="Create workspace from sidebar"
          >
            +
          </button>
        </div>
        <div className="workspace-list" data-testid="workspace-list">
          {workspaces.length === 0 && <p className="sidebar-empty">Create a workspace to begin.</p>}
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              data-testid="workspace-item"
              className={`sidebar-item ${workspace.id === selectedWorkspaceId ? 'active' : ''}`}
              aria-label={`Select workspace ${workspace.name}`}
              onClick={() => onSelectWorkspace(workspace.id)}
            >
              <span>{workspace.name}</span>
              <small>
                Updated · {new Date(workspace.updated_at).toLocaleDateString()}
                {workspace.id === selectedWorkspaceId ? ' · Active workspace' : ''}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section sidebar-summary" id="learning">
        <div>
          <span>Repo targets</span>
          <strong>{repos.length}</strong>
        </div>
        <div>
          <span>Learned recipes</span>
          <strong>{recipeTotal}</strong>
        </div>
        <button className="sidebar-primary" data-testid="add-repo-button" onClick={onOpenRepo}>Add repository</button>
      </section>
    </aside>
  );
}

function TopBar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  workspace,
  repo,
  repoCount,
  recipeCount,
  learningState,
  semanticStatus,
  busy
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  workspace: Workspace | null;
  repo: RepoTarget | null;
  repoCount: number;
  recipeCount?: number;
  learningState?: string;
  semanticStatus: SemanticStatus | null;
  busy: string;
}) {
  return (
    <header className="top-bar">
      <div className="top-app-title">
        <span className="menu-glyph">☰</span>
        <div>
          <p>StackPilot Control Plane</p>
          <strong>{workspace?.name ?? 'No workspace selected'}</strong>
        </div>
      </div>
      <label className="workspace-select">
        Workspace
        <select
          data-testid="workspace-selector"
          aria-label="Workspace selector"
          value={selectedWorkspaceId}
          onChange={(event) => onSelectWorkspace(event.target.value)}
        >
          <option value="">Select workspace</option>
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <div className="top-status">
        <StatusChip label={`${repoCount} repo${repoCount === 1 ? '' : 's'}`} tone={repoCount > 0 ? 'good' : 'muted'} />
        <StatusChip label={repo?.target_id ?? 'no target selected'} tone={repo ? 'good' : 'muted'} />
        <StatusChip label={repo?.status ?? 'not registered'} tone={repo?.status === 'discovered' ? 'good' : 'warn'} />
        <StatusChip label={`learning ${learningState ?? 'unknown'}`} tone={learningState === 'fresh' ? 'good' : 'muted'} />
        <StatusChip label={`${recipeCount ?? 0} recipes`} tone={(recipeCount ?? 0) > 0 ? 'good' : 'muted'} />
        <StatusChip
          label={`Semantic: ${semanticStatus?.available ? 'available' : 'off'}`}
          tone={semanticStatus?.available ? 'good' : 'muted'}
        />
        <StatusChip label={busy || 'ready'} tone={busy ? 'warn' : 'good'} />
      </div>
    </header>
  );
}

function RepoList({
  repos,
  validations,
  selectedTargetId,
  recipeCounts,
  learningStates,
  busy,
  onSelectRepo,
  onDiscover,
  onRefreshLearning,
  onOpenRepo
}: {
  repos: RepoTarget[];
  validations: Record<string, RepoTargetValidation>;
  selectedTargetId: string;
  recipeCounts: Record<string, number>;
  learningStates: Record<string, string>;
  busy: string;
  onSelectRepo: (id: string) => void;
  onDiscover: (targetId: string) => void;
  onRefreshLearning: (targetId: string) => void;
  onOpenRepo: () => void;
}) {
  return (
    <section id="repositories" className="repo-panel card-panel" data-testid="repo-list">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Repositories</p>
          <h2>Discovery targets</h2>
        </div>
        <button data-testid="repo-list-add-repo-button" onClick={onOpenRepo}>Add repository</button>
      </div>
      {repos.length === 0 ? (
        <EmptyCard
          title="No repo targets yet"
          text="Add a local path target to validate repo type, discover architecture, and generate Plan Bundles."
        />
      ) : (
        <div className="repo-table" role="table" aria-label="Registered repository targets">
          <div className="repo-table-row repo-table-head" role="row">
            <span>Repository</span>
            <span>Type</span>
            <span>Frameworks</span>
            <span>Status</span>
            <span>Locator</span>
            <span>Actions</span>
          </div>
          {repos.map((repo) => (
            <RepoTableRow
              key={repo.id}
              repo={repo}
              validation={validations[repo.target_id]}
              active={repo.target_id === selectedTargetId}
              recipeCount={recipeCounts[repo.target_id] ?? 0}
              learningState={learningStates[repo.target_id] ?? 'unknown'}
              busy={busy}
              onSelect={() => onSelectRepo(repo.target_id)}
              onDiscover={() => onDiscover(repo.target_id)}
              onRefreshLearning={() => onRefreshLearning(repo.target_id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RepoTableRow({
  repo,
  validation,
  active,
  recipeCount,
  learningState,
  busy,
  onSelect,
  onDiscover,
  onRefreshLearning
}: {
  repo: RepoTarget;
  validation?: RepoTargetValidation;
  active: boolean;
  recipeCount: number;
  learningState: string;
  busy: string;
  onSelect: () => void;
  onDiscover: () => void;
  onRefreshLearning: () => void;
}) {
  return (
    <div className={`repo-table-row ${active ? 'active' : ''}`} role="row">
      <div className="repo-name-cell">
        <strong>{repo.repo_name}</strong>
        <button className="link-button" onClick={onSelect}>{repo.target_id}</button>
      </div>
      <div>
        <StatusChip label={validation?.detected_repo_type ?? 'detecting'} tone={validation ? 'good' : 'muted'} />
      </div>
      <div className="framework-chip-row">
        {(validation?.detected_frameworks.length ? validation.detected_frameworks : ['pending']).map((framework) => (
          <StatusChip key={framework} label={framework} tone={framework === 'pending' ? 'muted' : 'good'} />
        ))}
      </div>
      <div className="repo-status-stack">
        <StatusChip label={repo.status} tone={repo.status === 'discovered' ? 'good' : 'warn'} />
        <StatusChip label={`learning ${learningState}`} tone={learningState === 'fresh' ? 'good' : 'muted'} />
        <StatusChip label={`${recipeCount} recipes`} tone={recipeCount > 0 ? 'good' : 'muted'} />
      </div>
      <div className="locator-cell">
        <code className="locator-text" title={repo.locator}>{compactPathLabel(repo.locator)}</code>
        <button
          type="button"
          className="secondary-button compact"
          aria-label={`Copy path for ${repo.target_id}`}
          onClick={() => copyText(repo.locator)}
        >
          Copy path
        </button>
      </div>
      <div className="repo-actions">
        <button data-testid="repo-discover-button" className="secondary-button" onClick={onDiscover} disabled={Boolean(busy)} title={busy ? `Waiting for ${busy}` : 'Refresh architecture discovery'}>Discover</button>
        <button data-testid="repo-refresh-learning-button" className="secondary-button" onClick={onRefreshLearning} disabled={Boolean(busy)} title={busy ? `Waiting for ${busy}` : 'Refresh learning recipes'}>Refresh learning</button>
        <button className="secondary-button" onClick={onSelect}>View details</button>
      </div>
    </div>
  );
}

function WorkspaceModal({
  workspaceName,
  onNameChange,
  onSubmit,
  onClose
}: {
  workspaceName: string;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Create workspace" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label>
          Workspace name
          <input data-testid="workspace-name-input" value={workspaceName} onChange={(event) => onNameChange(event.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button data-testid="create-workspace-button" type="submit">Create workspace</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetLocalDataModal({
  busy,
  onSubmit,
  onClose
}: {
  busy: boolean;
  onSubmit: (confirm: string) => void;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(confirmText);
  }
  return (
    <Modal title="Reset local data" onClose={onClose} testId="reset-local-data-modal">
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="notice danger">
          This deletes local StackPilot app state: workspaces, repo targets, plan runs, discovery registry,
          semantic cache, and learning cache. Source repos and baseline reports are preserved.
        </div>
        <label>
          Type RESET to confirm
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoFocus
            data-testid="reset-confirm-input"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className="danger-button"
            disabled={busy || confirmText !== 'RESET'}
            data-testid="confirm-reset-local-data-button"
          >
            {busy ? 'Resetting...' : 'Reset local data'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddRepoModal({
  repoTargetId,
  sourceType,
  locator,
  validation,
  validationBusy,
  validationError,
  recentPaths,
  folderPickerNote,
  onTargetIdChange,
  onSourceTypeChange,
  onLocatorChange,
  onUseSuggestedRoot,
  onPickFolder,
  onSubmit,
  onClose,
  disabled
}: {
  repoTargetId: string;
  sourceType: 'local_path' | 'git_url';
  locator: string;
  validation: RepoTargetValidation | null;
  validationBusy: boolean;
  validationError: string;
  recentPaths: string[];
  folderPickerNote: string;
  onTargetIdChange: (value: string) => void;
  onSourceTypeChange: (value: 'local_path' | 'git_url') => void;
  onLocatorChange: (value: string) => void;
  onUseSuggestedRoot: (path: string) => void;
  onPickFolder: () => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  return (
    <Modal title="Add repository" onClose={onClose} wide testId="add-repo-dialog">
      <form onSubmit={onSubmit} className="add-repo-layout">
        <div className="modal-form">
          <label htmlFor="repo-target-id-input">
            Target id
            <input id="repo-target-id-input" data-testid="repo-target-id-input" value={repoTargetId} onChange={(event) => onTargetIdChange(event.target.value)} autoFocus />
          </label>
          <label htmlFor="repo-source-type-input">
            Source type
            <select id="repo-source-type-input" data-testid="repo-source-type-select" value={sourceType} onChange={(event) => onSourceTypeChange(event.target.value as 'local_path' | 'git_url')}>
              <option value="local_path">local path</option>
              <option value="git_url">git URL (stored only)</option>
            </select>
          </label>
          <label htmlFor="repo-locator-input">
            Path or URL
            <input id="repo-locator-input" data-testid="repo-locator-input" value={locator} onChange={(event) => onLocatorChange(event.target.value)} />
          </label>
          <div className="inline-actions">
            <button type="button" className="secondary-button" onClick={onPickFolder}>Try browser folder picker</button>
            {validation?.suggested_root_path && (
              <button type="button" className="secondary-button strong" onClick={() => onUseSuggestedRoot(validation.suggested_root_path!)}>
                Use suggested root
              </button>
            )}
          </div>
          <p className="helper-text">
            Paste an absolute local path or GitHub URL. Native folder picker can be added in desktop/Tauri mode.
          </p>
          {folderPickerNote && <p className="helper-text">{folderPickerNote}</p>}
          {recentPaths.length > 0 && (
            <div className="recent-paths">
              <span>Recent paths</span>
              {recentPaths.map((path) => (
                <button type="button" className="path-pill" key={path} onClick={() => onLocatorChange(path)}>{path}</button>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-button" data-testid="add-repo-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" data-testid="add-repo-submit" disabled={disabled}>Add repo</button>
          </div>
        </div>
        <RepoValidationPreview validation={validation} busy={validationBusy} error={validationError} />
      </form>
    </Modal>
  );
}

function RepoValidationPreview({ validation, busy, error }: { validation: RepoTargetValidation | null; busy: boolean; error: string }) {
  if (busy) {
    return (
      <aside className="validation-preview empty" data-testid="repo-validation-status" role="status" aria-live="polite" aria-busy="true">
        <span>Validation preview</span>
        <p>Validating repo path...</p>
      </aside>
    );
  }
  if (error) {
    return (
      <aside className="validation-preview empty" data-testid="repo-validation-status" role="alert">
        <span>Validation preview</span>
        <p>{error}</p>
      </aside>
    );
  }
  if (!validation) {
    return (
      <aside className="validation-preview empty" data-testid="repo-validation-status" role="status" aria-live="polite">
        <span>Validation preview</span>
        <p>Enter a local path to detect repo type, frameworks, and common client-subfolder mistakes.</p>
      </aside>
    );
  }
  return (
    <aside className="validation-preview" data-testid="repo-validation-status" role="status" aria-live="polite">
      <div className="preview-head">
        <span>Validation preview</span>
        <StatusChip label={validation.detected_repo_type} tone={validation.detected_repo_type.includes('frontend') ? 'warn' : 'good'} />
      </div>
      <dl>
        <dt>Selected path</dt>
        <dd>{validation.selected_path}</dd>
        {validation.suggested_root_path && (
          <>
            <dt>Suggested root</dt>
            <dd>{validation.suggested_root_path}</dd>
          </>
        )}
        <dt>Frameworks</dt>
        <dd>{validation.detected_frameworks.join(', ') || 'none detected'}</dd>
      </dl>
      {validation.warnings.length > 0 && (
        <div className="warning-list">
          {validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </aside>
  );
}

function PromptComposer({
  featureRequest,
  selectedTargetId,
  repos,
  runId,
  busy,
  semanticStatus,
  useSemantic,
  selectedWorkspace,
  selectedRepo,
  onPromptChange,
  onTargetChange,
  onUseSemanticChange,
  onSubmit
}: {
  featureRequest: string;
  selectedTargetId: string;
  repos: RepoTarget[];
  runId: string;
  busy: string;
  semanticStatus: SemanticStatus | null;
  useSemantic: boolean;
  selectedWorkspace: Workspace | null;
  selectedRepo: RepoTarget | null;
  onPromptChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onUseSemanticChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const semanticAvailable = Boolean(semanticStatus?.available);
  const semanticHelpText = semanticStatus?.configured
    ? `${semanticStatus.provider ?? 'semantic provider'} · ${semanticStatus.model ?? 'model'} · ${semanticStatus.api_style ?? 'auto'}`
    : semanticStatus?.cached_artifact_available
      ? 'Latest cached semantic enrichment is available for this target.'
      : 'Semantic enrichment requires provider configuration or a cached target artifact.';
  return (
    <section className="composer-card" data-testid="prompt-composer">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Prompt</p>
          <h2>Ask StackPilot for a Plan Bundle</h2>
          <p className="context-line">
            Workspace: <strong>{selectedWorkspace?.name ?? 'none'}</strong>
            {' · '}
            Target: <strong>{selectedRepo?.target_id ?? 'none'}</strong>
          </p>
        </div>
        {runId && <StatusChip label={`run ${runId.slice(0, 8)}`} tone="muted" />}
      </div>
      <form onSubmit={onSubmit}>
        <div className="composer-grid">
          <label htmlFor="feature-request-input" className="feature-request-field">
            Feature request
            <textarea
              id="feature-request-input"
              data-testid="feature-request-textarea"
              value={featureRequest}
              onChange={(event) => onPromptChange(event.target.value)}
              rows={3}
              aria-describedby="feature-request-helper"
            />
            <small id="feature-request-helper">Describe the change you want StackPilot to plan for the selected repo target.</small>
          </label>
          <div className="composer-actions">
            <label>
              Target repository
              <select
                data-testid="target-repo-select"
                aria-label="Target repository"
                value={selectedTargetId}
                onChange={(event) => onTargetChange(event.target.value)}
              >
                <option value="">Choose target</option>
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.target_id}>{repo.target_id}</option>
                ))}
              </select>
            </label>
            <label className={`semantic-toggle ${semanticAvailable ? '' : 'disabled'}`}>
              <span>
                <input
                  type="checkbox"
                  data-testid="use-semantic-checkbox"
                  aria-label="Use semantic enrichment"
                  aria-describedby="semantic-toggle-helper"
                  title={semanticAvailable ? 'Use semantic enrichment for generated plans.' : semanticHelpText}
                  checked={useSemantic && semanticAvailable}
                  disabled={!semanticAvailable}
                  onChange={(event) => onUseSemanticChange(event.target.checked)}
                />
                Use semantic enrichment
              </span>
              <small id="semantic-toggle-helper">{semanticHelpText}</small>
            </label>
            <button type="submit" data-testid="generate-plan-button" disabled={!selectedTargetId || Boolean(busy)}>
              {busy === 'Generating Plan Bundle' ? 'Generating...' : 'Generate Plan Bundle'}
            </button>
          </div>
        </div>
        <div className="example-row" aria-label="Example prompts">
          {[
            'Add OwnersPage (no actions yet)',
            'add the ability to upload a picture of your pet',
            'Add Layout and Welcome page',
            'create a new contact-us page with the proper backend objects and api'
          ].map((example) => (
            <button key={example} type="button" onClick={() => onPromptChange(example)}>
              {example}
            </button>
          ))}
        </div>
      </form>
    </section>
  );
}

function PlanBundleView({
  bundle,
  runId,
  activeTab,
  onTabChange,
  sourceFilter,
  actionFilter,
  sectionFilter,
  onSourceFilterChange,
  onActionFilterChange,
  onSectionFilterChange,
  selectedChange,
  semanticContext,
  onSelectChange
}: {
  bundle: PlanBundle;
  runId: string;
  activeTab: PlanTab;
  onTabChange: (tab: PlanTab) => void;
  sourceFilter: SourceFilter;
  actionFilter: ActionFilter;
  sectionFilter: SectionFilter;
  onSourceFilterChange: (value: SourceFilter) => void;
  onActionFilterChange: (value: ActionFilter) => void;
  onSectionFilterChange: (value: SectionFilter) => void;
  selectedChange: PlanBundleChangeItem | null;
  semanticContext: PlanRunSemanticContext;
  onSelectChange: (item: PlanBundleChangeItem) => void;
}) {
  const filteredChanges = bundle.recommended_change_set.filter((item) => {
    return (
      (sourceFilter === 'all' || item.source === sourceFilter) &&
      (actionFilter === 'all' || item.action === actionFilter) &&
      (sectionFilter === 'all' || item.ui_section === sectionFilter)
    );
  });

  return (
    <section className="bundle-panel" data-testid="plan-bundle-view">
      <div className="bundle-header">
        <div>
          <p className="eyebrow">Plan Bundle</p>
          <h2>{bundle.summary.title}</h2>
        </div>
        <div className="bundle-chips">
          <StatusChip label={bundle.summary.confidence} tone={bundle.summary.confidence === 'high' ? 'good' : bundle.summary.confidence === 'medium' ? 'warn' : 'danger'} />
          <StatusChip label={bundle.summary.planning_mode} tone="muted" />
          <StatusChip
            label={`Semantic enrichment: ${bundle.semantic_enrichment?.available ? 'On' : semanticContext.requested ? 'Requested' : 'Off'}`}
            tone={bundle.semantic_enrichment?.available ? 'good' : semanticContext.requested ? 'warn' : 'muted'}
          />
          {semanticContext.status && (
            <StatusChip
              label={`Semantic cache: ${bundle.semantic_cache_status ?? (semanticContext.status.cached_artifact_available ? 'target artifact' : 'miss')}`}
              tone={bundle.semantic_cache_status === 'hit' || bundle.semantic_cache_status === 'regenerated' ? 'good' : bundle.semantic_cache_status === 'skipped_prompt_mismatch' ? 'warn' : 'muted'}
            />
          )}
          {semanticProviderLabel(bundle, semanticContext) && <StatusChip label={semanticProviderLabel(bundle, semanticContext)} tone="muted" />}
          {[...new Set([...bundle.summary.detected_intents, ...semanticIntentLabels(bundle)])].slice(0, 14).map((intent) => <StatusChip key={intent} label={intent} tone="good" />)}
        </div>
      </div>
      {semanticContext.requested && !bundle.semantic_enrichment?.available && (
        <Notice
          tone="warning"
          text={bundle.semantic_cache_message || "Semantic enrichment was requested but no provider or matching cached semantic artifact was available."}
        />
      )}
      <Tabs active={activeTab} onChange={onTabChange} />
      <div className="tab-body">
        {activeTab === 'overview' && <OverviewTab bundle={bundle} />}
        {activeTab === 'changes' && (
          <ChangeSetTab
            changes={filteredChanges}
            sourceFilter={sourceFilter}
            actionFilter={actionFilter}
            sectionFilter={sectionFilter}
            onSourceFilterChange={onSourceFilterChange}
            onActionFilterChange={onActionFilterChange}
            onSectionFilterChange={onSectionFilterChange}
            selectedChange={selectedChange}
            onSelectChange={onSelectChange}
          />
        )}
        {activeTab === 'recipes' && <RecipesTab bundle={bundle} />}
        {activeTab === 'graph' && <GraphEvidenceTab bundle={bundle} />}
        {activeTab === 'validation' && <ValidationTab bundle={bundle} />}
        {activeTab === 'handoff' && <HandoffTab bundle={bundle} runId={runId} />}
        {activeTab === 'json' && <JsonViewer bundle={bundle} />}
      </div>
    </section>
  );
}

function Tabs({ active, onChange }: { active: PlanTab; onChange: (tab: PlanTab) => void }) {
  const tabs: Array<[PlanTab, string, string]> = [
    ['overview', 'Overview', 'plan-tab-overview'],
    ['changes', 'Change Set', 'plan-tab-change-set'],
    ['recipes', 'Recipes', 'plan-tab-recipes'],
    ['graph', 'Graph Evidence', 'plan-tab-graph'],
    ['validation', 'Validation', 'plan-tab-validation'],
    ['handoff', 'Handoff', 'plan-tab-handoff'],
    ['json', 'Raw JSON', 'plan-tab-json']
  ];
  return (
    <div className="tabs" role="tablist" aria-label="Plan Bundle sections">
      {tabs.map(([value, label, testId]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={active === value}
          data-testid={testId}
          className={active === value ? 'active' : ''}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OverviewTab({ bundle }: { bundle: PlanBundle }) {
  const semanticLabels = semanticIntentLabels(bundle);
  const semanticMissing = bundle.semantic_missing_details ?? bundle.semantic_enrichment?.feature_spec?.missing_details ?? [];
  const semanticQuestions = bundle.semantic_clarifying_questions ?? bundle.semantic_enrichment?.feature_spec?.clarifying_questions ?? [];
  const semanticCaveats = bundle.semantic_caveats ?? bundle.semantic_enrichment?.caveats ?? [];
  return (
    <div className="overview-grid">
      <section className="overview-main card-panel">
        <h3>Summary</h3>
        <p>{bundle.summary.short_description ?? bundle.feature_request}</p>
        <div className="metric-grid">
          <Metric label="Primary owner" value={bundle.ownership.primary_owner ?? '-'} />
          <Metric label="Implementation" value={bundle.ownership.implementation_owner ?? '-'} />
          <Metric label="Domain owner" value={bundle.ownership.domain_owner ?? '-'} />
          <Metric label="Backend" value={bundle.summary.backend_required ? (bundle.summary.backend_available ? 'available' : 'missing') : 'not required'} />
        </div>
        {bundle.summary.new_domain_candidates.length > 0 && (
          <div className="notice warning">
            New domain candidate: {bundle.summary.new_domain_candidates.join(', ')}. Plan conservatively until source structure confirms it.
          </div>
        )}
        {bundle.recommended_change_set.length > 0 && (
          <div className="overview-recommendations">
            <h3>Top recommendations</h3>
            <div className="recommendation-path-list">
              {bundle.recommended_change_set.slice(0, 10).map((item) => (
                <div key={`${item.priority}-${item.path}`} className="recommendation-path-row">
                  <span className="priority-badge">{item.priority}</span>
                  <code title={item.path}>{item.path}</code>
                  <StatusChip label={item.source} tone={item.source === 'both' || item.source === 'semantic_enrichment' ? 'good' : 'muted'} />
                </div>
              ))}
            </div>
          </div>
        )}
        {bundle.semantic_enrichment?.available && (
          <div className="semantic-summary">
            <h3>Semantic enrichment</h3>
            <div className="chip-row">
              <StatusChip label="semantic_enrichment" tone="good" />
              {semanticLabels.slice(0, 16).map((label) => <StatusChip key={label} label={label} tone="muted" />)}
            </div>
            {bundle.semantic_enrichment.model_info && (
              <p className="muted">
                Model: {String(bundle.semantic_enrichment.model_info.model ?? bundle.semantic_enrichment.model_info.provider ?? 'configured provider')}
              </p>
            )}
          </div>
        )}
      </section>
      <section className="card-panel caveat-panel">
        <h3>Key caveats</h3>
        {bundle.target.warnings.map((warning) => <Notice key={warning} tone="warning" text={warning} />)}
        {bundle.risks_and_caveats.slice(0, 5).map((risk, index) => (
          <Notice key={`${risk.source}-${index}`} tone={risk.severity === 'high' ? 'danger' : 'warning'} text={risk.message} />
        ))}
        {semanticMissing.slice(0, 4).map((detail) => <Notice key={`semantic-missing-${detail}`} tone="warning" text={`Semantic missing detail: ${detail}`} />)}
        {semanticQuestions.slice(0, 4).map((question) => <Notice key={`semantic-question-${question}`} tone="info" text={`Question: ${question}`} />)}
        {semanticCaveats.slice(0, 4).map((caveat) => <Notice key={`semantic-caveat-${caveat}`} tone="warning" text={`Semantic caveat: ${caveat}`} />)}
        {bundle.target.warnings.length === 0 && bundle.risks_and_caveats.length === 0 && semanticMissing.length === 0 && semanticQuestions.length === 0 && semanticCaveats.length === 0 && <p className="muted">No major caveats reported.</p>}
      </section>
    </div>
  );
}

function ChangeSetTab({
  changes,
  sourceFilter,
  actionFilter,
  sectionFilter,
  onSourceFilterChange,
  onActionFilterChange,
  onSectionFilterChange,
  selectedChange,
  onSelectChange
}: {
  changes: PlanBundleChangeItem[];
  sourceFilter: SourceFilter;
  actionFilter: ActionFilter;
  sectionFilter: SectionFilter;
  onSourceFilterChange: (value: SourceFilter) => void;
  onActionFilterChange: (value: ActionFilter) => void;
  onSectionFilterChange: (value: SectionFilter) => void;
  selectedChange: PlanBundleChangeItem | null;
  onSelectChange: (item: PlanBundleChangeItem) => void;
}) {
  const groupedChanges = groupChangesByArea(changes);
  return (
    <div className="change-set-layout">
      <div className="filter-row">
        <FilterSelect label="Source" value={sourceFilter} values={['all', 'planner', 'recipe', 'semantic_enrichment', 'both']} onChange={(value) => onSourceFilterChange(value as SourceFilter)} />
        <FilterSelect label="Action" value={actionFilter} values={['all', 'modify', 'create', 'inspect', 'inspect-only']} onChange={(value) => onActionFilterChange(value as ActionFilter)} />
        <FilterSelect label="Section" value={sectionFilter} values={['all', 'frontend', 'backend', 'api', 'persistence', 'config', 'unknown']} onChange={(value) => onSectionFilterChange(value as SectionFilter)} />
      </div>
      <div className="change-card-list" data-testid="change-set-list">
        {changes.length === 0 && <p className="muted">No recommendations match these filters.</p>}
        {groupedChanges.map(([area, items]) => (
          <section key={area} className="change-group" aria-label={`${area} recommendations`}>
            <h3>{area}</h3>
            {items.map((item) => (
              <ChangeSetCard
                key={`${item.priority}-${item.repo_name}-${item.path}`}
                item={item}
                active={selectedChange?.priority === item.priority && selectedChange?.path === item.path}
                onSelect={() => onSelectChange(item)}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ChangeSetCard({ item, active, onSelect }: { item: PlanBundleChangeItem; active: boolean; onSelect: () => void }) {
  return (
    <article className={`change-card ${active ? 'active' : ''}`}>
      <button type="button" className="change-card-main" onClick={onSelect}>
        <div className="change-card-top">
          <span className="priority-badge">{item.priority}</span>
          <code>{item.path}</code>
        </div>
        <p>{item.reason}</p>
        <div className="chip-row">
          <StatusChip label={item.action} tone={item.action === 'create' || item.action === 'modify' ? 'good' : 'muted'} />
          <StatusChip label={item.confidence} tone={item.confidence === 'high' ? 'good' : item.confidence === 'medium' ? 'warn' : 'muted'} />
          <StatusChip label={item.source} tone={item.source === 'both' ? 'good' : 'muted'} />
          <StatusChip label={item.ui_section ?? 'unknown'} tone="muted" />
        </div>
      </button>
      {item.evidence?.length > 0 && (
        <details className="evidence-details">
          <summary>Evidence</summary>
          <ul>
            {item.evidence.slice(0, 6).map((evidence) => <li key={evidence}>{evidence}</li>)}
          </ul>
        </details>
      )}
    </article>
  );
}

function groupChangesByArea(changes: PlanBundleChangeItem[]): Array<[string, PlanBundleChangeItem[]]> {
  const grouped = new Map<string, PlanBundleChangeItem[]>();
  for (const item of changes) {
    const area = repairAreaForChange(item);
    grouped.set(area, [...(grouped.get(area) ?? []), item]);
  }
  const order = ['Frontend', 'Backend/API', 'Persistence/Storage', 'Display/Reference', 'Unknown'];
  return [...grouped.entries()].sort((left, right) => order.indexOf(left[0]) - order.indexOf(right[0]));
}

function repairAreaForChange(item: PlanBundleChangeItem): string {
  const text = `${item.ui_section} ${item.node_type} ${item.path} ${item.reason}`.toLowerCase();
  if (/client\/src|tsx|jsx|frontend|component|page|form|types/.test(text)) return 'Frontend';
  if (/controller|api|rest|endpoint|mapper|service/.test(text)) return 'Backend/API';
  if (/repository|jdbc|entity|model|database|persistence|storage|upload|file|media/.test(text)) return 'Persistence/Storage';
  if (/display|view|reference|retrieval|read/.test(text)) return 'Display/Reference';
  return 'Unknown';
}

function semanticIntentLabels(bundle: PlanBundle): string[] {
  return dedupeStrings([
    ...(bundle.semantic_enrichment?.technical_intent_labels ?? []),
    ...(bundle.semantic_enrichment?.technical_intents ?? []),
    ...(bundle.semantic_enrichment?.feature_spec?.technical_intent_labels ?? []),
    ...(bundle.semantic_enrichment?.feature_spec?.technical_intents ?? [])
  ]);
}

function semanticProviderLabel(bundle: PlanBundle, context: PlanRunSemanticContext): string {
  const modelInfo = bundle.semantic_enrichment?.model_info ?? {};
  const provider = modelInfo.provider ?? context.status?.provider;
  const model = modelInfo.model ?? context.status?.model;
  if (provider && model) return `${String(provider)} · ${String(model)}`;
  if (provider) return String(provider);
  if (model) return String(model);
  return '';
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function RecipesTab({ bundle }: { bundle: PlanBundle }) {
  if (bundle.matched_recipes.length === 0) {
    return <EmptyCard title="No matched recipes" text="Planner-native evidence is still visible in the change set." />;
  }
  return (
    <div className="recipe-grid">
      {bundle.matched_recipes.map((recipe) => <RecipeCard key={recipe.recipe_id} recipe={recipe} />)}
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: PlanBundle['matched_recipes'][number] }) {
  return (
    <article className="recipe-card card-panel">
      <div className="recipe-card-head">
        <StatusChip label={recipe.recipe_type} tone="good" />
        <span>{recipe.recipe_id}</span>
      </div>
      <div className="two-metrics">
        <Metric label="Structural" value={recipe.structural_confidence.toFixed(2)} />
        <Metric label="Planner effectiveness" value={recipe.planner_effectiveness.toFixed(2)} />
      </div>
      {recipe.why_matched.length > 0 && (
        <ul>
          {recipe.why_matched.slice(0, 4).map((why) => <li key={why}>{why}</li>)}
        </ul>
      )}
      {recipe.learned_patterns && (
        <p className="muted">
          Patterns: {[...(recipe.learned_patterns.created_node_types ?? []), ...(recipe.learned_patterns.modified_node_types ?? [])].slice(0, 5).join(', ') || 'compact recipe metadata only'}
        </p>
      )}
    </article>
  );
}

function GraphEvidenceTab({ bundle }: { bundle: PlanBundle }) {
  if (!bundle.source_graph_evidence?.length) {
    return <EmptyCard title="No compact graph evidence" text="The Plan Bundle did not include graph nodes for this run." />;
  }
  return (
    <div className="evidence-grid">
      {bundle.source_graph_evidence.map((node) => <EvidenceCard key={`${node.repo_name}-${node.path}`} node={node} />)}
    </div>
  );
}

function EvidenceCard({ node }: { node: PlanBundle['source_graph_evidence'][number] }) {
  return (
    <article className="evidence-card card-panel">
      <div className="chip-row">
        <StatusChip label={node.node_type} tone="muted" />
        <StatusChip label={node.confidence} tone={node.confidence === 'high' ? 'good' : 'muted'} />
      </div>
      <code>{node.path}</code>
      <p>{node.reason}</p>
      <div className="token-row">
        {node.domain_tokens.slice(0, 8).map((token) => <span key={token}>{token}</span>)}
      </div>
    </article>
  );
}

function ValidationTab({ bundle }: { bundle: PlanBundle }) {
  return (
    <div className="validation-list">
      {bundle.validation.commands.length === 0 && <EmptyCard title="No validation commands" text="Run the repo’s normal build and test command if available." />}
      {bundle.validation.commands.map((command) => (
        <CopyBlock key={command} text={command} label="Copy command" />
      ))}
      {bundle.validation.notes.map((note) => <Notice key={note} tone="info" text={note} />)}
    </div>
  );
}

function HandoffTab({ bundle, runId }: { bundle: PlanBundle; runId: string }) {
  if (bundle.handoff_prompts.length === 0) {
    return <EmptyCard title="No handoff prompt" text="Generate a Plan Bundle with concrete recommendations to create a repo handoff prompt." />;
  }
  return (
    <div className="handoff-list" data-testid="handoff-prompt-panel">
      <div className="run-metadata card-panel" data-testid="run-metadata">
        <h3>Current run</h3>
        <p><strong>Prompt:</strong> {bundle.feature_request}</p>
        <p><strong>Run id:</strong> {runId || '-'}</p>
        <p><strong>Semantic cache:</strong> {bundle.semantic_cache_status ?? 'unavailable'}</p>
        {bundle.semantic_cache_message && <p><strong>Semantic note:</strong> {bundle.semantic_cache_message}</p>}
      </div>
      {bundle.handoff_prompts.map((handoff) => <HandoffPromptCard key={handoff.repo_name} handoff={handoff} bundle={bundle} />)}
    </div>
  );
}

function HandoffPromptCard({ handoff, bundle }: { handoff: PlanBundle['handoff_prompts'][number]; bundle: PlanBundle }) {
  const semanticLabels = semanticIntentLabels(bundle);
  const caveats = [...(bundle.semantic_caveats ?? []), ...(bundle.semantic_missing_details ?? [])];
  if (import.meta.env.DEV) {
    const promptText = handoff.prompt.toLowerCase();
    const hasUploadText = /file upload|picture upload|media_upload|file_upload|storage strategy|image metadata|picture preview/.test(promptText);
    const hasUploadSemantics = semanticLabels.some((label) => ['file_upload', 'media_upload', 'storage'].includes(label));
    if (hasUploadText && !hasUploadSemantics) {
      console.warn('[StackPilot] handoff prompt may contain stale upload semantics absent from current bundle', {
        feature_request: bundle.feature_request,
        semantic_cache_status: bundle.semantic_cache_status,
        semanticLabels
      });
    }
  }
  return (
    <article className="handoff-card card-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{handoff.repo_name}</p>
          <h3>{handoff.title}</h3>
        </div>
        <button
          type="button"
          data-testid="copy-handoff-prompt"
          aria-label={`Copy handoff prompt for ${handoff.repo_name}`}
          onClick={() => copyText(handoff.prompt)}
        >
          Copy prompt
        </button>
      </div>
      {semanticLabels.length > 0 && (
        <div className="chip-row" aria-label="Semantic handoff labels">
          {semanticLabels.slice(0, 16).map((label) => <StatusChip key={label} label={label} tone="muted" />)}
        </div>
      )}
      {caveats.length > 0 && (
        <div className="notice warning">
          Semantic caveats: {caveats.slice(0, 3).join(' · ')}
        </div>
      )}
      <pre>{handoff.prompt}</pre>
    </article>
  );
}

function JsonViewer({ bundle }: { bundle: PlanBundle }) {
  const text = JSON.stringify(bundle, null, 2);
  return (
    <article className="json-viewer card-panel" data-testid="plan-json-viewer">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">UI contract</p>
          <h3>Raw Plan Bundle JSON</h3>
        </div>
        <button
          type="button"
          data-testid="copy-raw-json"
          aria-label="Copy raw JSON"
          onClick={() => copyText(text)}
        >
          Copy JSON
        </button>
      </div>
      <details open>
        <summary>Structured response</summary>
        <pre>{text}</pre>
      </details>
    </article>
  );
}

function RightInspector({ bundle, selectedChange }: { bundle: PlanBundle | null; selectedChange: PlanBundleChangeItem | null }) {
  return (
    <aside className="inspector">
      <div className="inspector-section">
        <p className="eyebrow">Inspector</p>
        <h2>{selectedChange ? 'Selected recommendation' : 'Evidence & caveats'}</h2>
      </div>
      {selectedChange ? (
        <div className="inspector-card">
          <code>{selectedChange.path}</code>
          <div className="chip-row">
            <StatusChip label={selectedChange.action} tone="good" />
            <StatusChip label={selectedChange.confidence} tone={selectedChange.confidence === 'high' ? 'good' : 'warn'} />
            <StatusChip label={selectedChange.source} tone="muted" />
          </div>
          <p>{selectedChange.reason}</p>
          {selectedChange.evidence?.length > 0 && (
            <>
              <h3>Evidence</h3>
              <ul>
                {selectedChange.evidence.slice(0, 6).map((evidence) => <li key={evidence}>{evidence}</li>)}
              </ul>
            </>
          )}
          {selectedChange.matched_recipe_id && <p className="muted">Recipe: {selectedChange.matched_recipe_id}</p>}
          <p className="muted">Exists now: {selectedChange.exists_in_current_source ? 'yes' : 'no or not known'}</p>
        </div>
      ) : (
        <p className="muted">Select a change-set card to inspect its evidence, source, and confidence.</p>
      )}

      {bundle && (
        <>
          <div className="inspector-card compact-list">
            <h3>Owners</h3>
            <p>Primary: {bundle.ownership.primary_owner ?? '-'}</p>
            <p>Implementation: {bundle.ownership.implementation_owner ?? '-'}</p>
            <p>Domain: {bundle.ownership.domain_owner ?? '-'}</p>
          </div>
          <div className="inspector-card compact-list">
            <h3>Caveats</h3>
            {bundle.risks_and_caveats.slice(0, 5).map((risk, index) => (
              <p key={`${risk.source}-${index}`} className={`inline-risk ${risk.severity}`}>{risk.message}</p>
            ))}
            {bundle.risks_and_caveats.length === 0 && <p className="muted">No caveats.</p>}
          </div>
          <div className="inspector-card compact-list">
            <h3>Recipe evidence</h3>
            {bundle.matched_recipes.slice(0, 4).map((recipe) => <p key={recipe.recipe_id}>{recipe.recipe_type}: {recipe.structural_confidence.toFixed(2)}</p>)}
            {bundle.matched_recipes.length === 0 && <p className="muted">No matched recipes.</p>}
          </div>
          <div className="inspector-card compact-list">
            <h3>Semantic enrichment</h3>
            {bundle.semantic_enrichment?.available ? (
              <>
                <p>Status: enabled</p>
                <p>Intents: {(bundle.semantic_enrichment.technical_intent_labels ?? []).slice(0, 8).join(', ') || '-'}</p>
                {(bundle.semantic_missing_details ?? []).slice(0, 3).map((detail) => (
                  <p key={detail} className="inline-risk warning">{detail}</p>
                ))}
              </>
            ) : (
              <p className="muted">Not used for this plan run.</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function StatusChip({ label, tone = 'muted' }: { label: string; tone?: 'good' | 'warn' | 'danger' | 'muted' }) {
  return <span className={`status-chip ${tone}`}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Notice({ text, tone }: { text: string; tone: 'info' | 'warning' | 'danger' }) {
  return <p className={`notice ${tone}`}>{text}</p>;
}

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label className="filter-select">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="copy-block">
      <code>{text}</code>
      <button className="secondary-button" onClick={() => copyText(text)}>{label}</button>
    </div>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-card">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function EmptyPlanState() {
  return (
    <section className="empty-plan">
      <p className="eyebrow">Waiting for input</p>
      <h2>Generate a Plan Bundle to render ownership, changes, recipes, graph evidence, validation, and handoff prompts.</h2>
      <p>Everything stays local-first and read-only. StackPilot creates structured planning artifacts for coding agents; it does not edit target repos.</p>
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
  testId
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  testId?: string;
}) {
  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop">
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function loadRecentPaths(): string[] {
  try {
    const value = window.localStorage.getItem(RECENT_PATHS_KEY);
    return value ? JSON.parse(value).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function clearStackPilotLocalStorage() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('stackpilot.'))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Local storage is best-effort only; backend reset is authoritative.
  }
}

function rememberRecentPath(path: string, setRecentPaths: (value: string[]) => void) {
  const clean = path.trim();
  if (!clean) return;
  const next = [clean, ...loadRecentPaths().filter((item) => item !== clean)].slice(0, 5);
  window.localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(next));
  setRecentPaths(next);
}

function middleEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const half = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

function compactPathLabel(value: string): string {
  if (!value.includes('/') && !value.includes('\\')) return middleEllipsis(value, 64);
  const parts = value.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 3) return middleEllipsis(value, 64);
  return `…/${parts.slice(-3).join('/')}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}
