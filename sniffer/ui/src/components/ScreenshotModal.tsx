export interface ScreenshotContext {
  src: string
  title: string
  subtitle?: string
  details?: string[]
}

export function ScreenshotModal({ screenshot, onClose }: { screenshot: ScreenshotContext | null; onClose: () => void }) {
  if (!screenshot) return null
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
          <img src={artifactUrl(screenshot.src)} alt={screenshot.title} />
          <aside>
            <h3>Context</h3>
            <ul className="evidence-list">
              {(screenshot.details ?? []).map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
            <a href={artifactUrl(screenshot.src)} target="_blank" rel="noreferrer">Open full image</a>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function artifactUrl(path: string): string {
  if (/^https?:\/\//.test(path) || path.startsWith('/api/')) return path
  const marker = '/reports/sniffer/latest/'
  const index = path.indexOf(marker)
  const relative = index >= 0 ? path.slice(index + marker.length) : path.replace(/^\/+/, '')
  return `/api/reports/latest/artifacts/${encodeURIComponent(relative)}`
}
