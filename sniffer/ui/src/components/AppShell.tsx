import type { ReactNode } from 'react'
import type { RunRecord, ServerStatus, SnifferProject } from '../api'

export type Screen = 'summary' | 'projects' | 'timeline' | 'scenarios' | 'crawl' | 'workflows' | 'agent' | 'issues' | 'fixes' | 'repair' | 'screenshots' | 'graph' | 'raw' | 'settings'

export function AppShell({
  screen,
  onScreenChange,
  status,
  run,
  projects,
  selectedProjectId,
  onProjectChange,
  onAddProject,
  children
}: {
  screen: Screen
  onScreenChange: (screen: Screen) => void
  status?: ServerStatus
  run?: RunRecord | null
  projects?: SnifferProject[]
  selectedProjectId?: string
  onProjectChange?: (projectId: string) => void
  onAddProject?: () => void
  children: ReactNode
}) {
  const running = run?.status === 'running' || status?.status === 'running'
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sniffer</strong>
            <span>UI QA agent</span>
          </div>
        </div>
        <nav aria-label="Sniffer dashboard navigation">
          {navItems.map((item) => (
            <button
              key={item.screen}
              type="button"
              className={screen === item.screen ? 'nav-item active' : 'nav-item'}
              aria-current={screen === item.screen ? 'page' : undefined}
              onClick={() => onScreenChange(item.screen)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-panel">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Local-first QA</p>
            <h1>Sniffer Dashboard</h1>
          </div>
          <div className="top-status">
            <label className="project-select">
              <span>Project</span>
              <select
                aria-label="Selected Sniffer project"
                value={selectedProjectId ?? ''}
                onChange={(event) => onProjectChange?.(event.target.value)}
              >
                <option value="">Latest / ad hoc</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-button small" onClick={onAddProject}>Add project</button>
            <span className={`status-chip ${running ? 'warn' : 'good'}`}>{running ? 'Running' : 'Idle'}</span>
            <span className="status-chip muted">v{status?.version ?? '0.1.0'}</span>
            <span className={`status-chip ${status?.provider.configured ? 'good' : 'muted'}`}>
              LLM {status?.provider.configured ? 'configured' : 'not configured'}
            </span>
          </div>
        </header>
        {running && (
          <div className="run-status-bar" role="status">
            <span className="pulse" />
            <strong>{run?.phase ?? 'Running Sniffer'}</strong>
            <span>{run?.logs.at(-1) ?? 'Waiting for logs...'}</span>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

const navItems: Array<{ screen: Screen; label: string }> = [
  { screen: 'summary', label: 'Summary' },
  { screen: 'projects', label: 'Projects' },
  { screen: 'timeline', label: 'Run Timeline' },
  { screen: 'scenarios', label: 'Scenarios' },
  { screen: 'crawl', label: 'Crawl Path' },
  { screen: 'workflows', label: 'Workflow Evidence' },
  { screen: 'agent', label: 'Agent Model' },
  { screen: 'issues', label: 'Issues' },
  { screen: 'fixes', label: 'Fix Packets' },
  { screen: 'repair', label: 'Repair Workbench' },
  { screen: 'screenshots', label: 'Screenshots' },
  { screen: 'graph', label: 'Graph Explorer' },
  { screen: 'raw', label: 'Raw JSON' },
  { screen: 'settings', label: 'Settings' }
]
