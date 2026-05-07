import { useState } from 'react'
import type { SnifferProject } from '../api'

interface AddProjectForm {
  id: string
  name: string
  repoPath: string
  appUrl: string
  productGoal: string
}

const emptyProjectForm: AddProjectForm = {
  id: '',
  name: '',
  repoPath: '',
  appUrl: '',
  productGoal: ''
}

export function ProjectsView({
  projects,
  selectedProjectId,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onAuditProject
}: {
  projects: SnifferProject[]
  selectedProjectId?: string
  onSelectProject: (project: SnifferProject) => void
  onAddProject: (input: { id?: string; name: string; repoPath: string; appUrl: string; productGoal?: string }) => Promise<void>
  onRemoveProject: (project: SnifferProject) => Promise<void>
  onAuditProject: (project: SnifferProject) => void
}) {
  const [showForm, setShowForm] = useState(projects.length === 0)
  const [form, setForm] = useState<AddProjectForm>(emptyProjectForm)
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    if (!form.name.trim() || !form.repoPath.trim() || !form.appUrl.trim()) {
      setError('Project name, repo path, and app URL are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onAddProject({
        id: form.id.trim() || undefined,
        name: form.name.trim(),
        repoPath: form.repoPath.trim(),
        appUrl: form.appUrl.trim(),
        productGoal: form.productGoal.trim() || undefined
      })
      setForm(emptyProjectForm)
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack" data-testid="projects-view">
      <section className="summary-hero">
        <div>
          <p className="eyebrow">Projects</p>
          <h2>Registered UI targets</h2>
          <p>Save repo paths and app URLs once, then run project-scoped audits and browse matching reports.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Hide form' : 'Add project'}
        </button>
      </section>

      {showForm && (
        <section className="card-panel">
          <div className="section-heading compact">
            <h2>Add project</h2>
            <span className="status-chip muted">local registry</span>
          </div>
          {error && <div className="alert danger" role="alert">{error}</div>}
          <div className="status-note" role="status" aria-live="polite">
            Project registry loading status: {busy ? 'saving project' : removingId ? 'removing project' : 'idle'}
          </div>
          <div className="form-grid">
            <label>
              Project id
              <input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} placeholder="workspace-control" aria-label="Project id" />
            </label>
            <label>
              Project name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Workspace Control" aria-label="Project name" />
            </label>
            <label>
              Repo path
              <input className="path-input" value={form.repoPath} onChange={(event) => setForm({ ...form, repoPath: event.target.value })} placeholder="/path/to/ui/repo" aria-label="Repo path" />
            </label>
            <label>
              App URL
              <input value={form.appUrl} onChange={(event) => setForm({ ...form, appUrl: event.target.value })} placeholder="http://127.0.0.1:5173" aria-label="App URL" />
            </label>
            <label className="span-2">
              Product goal
              <textarea value={form.productGoal} onChange={(event) => setForm({ ...form, productGoal: event.target.value })} placeholder="Optional context Sniffer can use when inferring product intent." aria-label="Product goal" />
            </label>
          </div>
          <div className="action-row">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Adding...' : 'Save project'}
            </button>
            <button type="button" className="secondary-button" onClick={() => setForm(emptyProjectForm)}>Clear</button>
          </div>
        </section>
      )}

      <section className="project-grid" aria-label="Registered projects">
        {projects.length === 0 && (
          <article className="card-panel">
            <h3>No projects registered yet</h3>
            <p className="muted-text">Add a UI repo and app URL to make Sniffer target-aware.</p>
          </article>
        )}
        {projects.map((project) => (
          <article key={project.id} className={project.id === selectedProjectId ? 'project-card active' : 'project-card'}>
            <div className="section-heading compact">
              <div>
                <h3>{project.name}</h3>
                <p className="muted-text">{project.id}</p>
              </div>
              <span className="status-chip muted">{project.profile?.profile_type ?? 'unknown'}</span>
            </div>
            <dl className="project-details">
              <div><dt>Repo</dt><dd title={project.repoPath}>{project.repoPath}</dd></div>
              <div><dt>URL</dt><dd>{project.appUrl}</dd></div>
              <div><dt>Framework</dt><dd>{project.framework} / {project.buildTool}</dd></div>
              <div><dt>Discovery</dt><dd>{project.discoveryMode ?? 'hybrid'}</dd></div>
              <div><dt>Latest run</dt><dd>{project.latestRunId ?? 'none'}</dd></div>
            </dl>
            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => onSelectProject(project)}>Select</button>
              <button type="button" className="primary-button" onClick={() => onAuditProject(project)}>Audit</button>
              <button
                type="button"
                className="ghost-button"
                disabled={removingId === project.id}
                onClick={() => {
                  setRemovingId(project.id)
                  setError('')
                  void onRemoveProject(project)
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                    .finally(() => setRemovingId(''))
                }}
              >
                {removingId === project.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
