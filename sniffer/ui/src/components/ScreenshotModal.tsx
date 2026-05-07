export interface ScreenshotContext {
  src: string
  title: string
  subtitle?: string
  details?: string[]
}

export function ScreenshotModal({ screenshot, projectId, onClose }: { screenshot: ScreenshotContext | null; projectId?: string; onClose: () => void }) {
  if (!screenshot) return null
  const src = artifactUrl(screenshot.src, projectId)
  return (
    <div className="screenshot-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Screenshot ${screenshot.title}`}>
      <div className="screenshot-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Screenshot evidence</p>
            <h2>{screenshot.title}</h2>
            {screenshot.subtitle && <p className="muted">{screenshot.subtitle}</p>}
          </div>
          <button type="button" className="ghost-button" onClick={onClose} aria-label="Close screenshot preview">Close</button>
        </div>
        <div className="screenshot-modal-grid">
          <img src={src} alt={screenshot.title} />
          <aside>
            <h3>Context</h3>
            <ul className="evidence-list">
              {(screenshot.details ?? []).map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
            <a href={src} target="_blank" rel="noreferrer">Open full image</a>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function artifactUrl(path: string, projectId?: string): string {
  if (/^https?:\/\//.test(path) || path.startsWith('/api/')) return path
  const normalized = path.replace(/\\/g, '/')
  const projectMatch = normalized.match(/\/reports\/sniffer\/[^/]+\/latest\/(.+)$/)
  const latestMatch = normalized.match(/\/reports\/sniffer\/latest\/(.+)$/)
  const relative = (projectMatch?.[1] ?? latestMatch?.[1] ?? normalized.replace(/^\/+/, '')).replace(/^(\.\.\/)+/, '')
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : ''
  return `/api/reports/latest/artifacts/${encodeURIComponent(relative)}${query}`
}
