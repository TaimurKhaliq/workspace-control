import type { ScreenshotItem } from '../api'

export function ScreenshotGallery({ screenshots }: { screenshots: ScreenshotItem[] }) {
  const groups = screenshots.reduce<Record<string, ScreenshotItem[]>>((acc, item) => {
    acc[item.group] ??= []
    acc[item.group].push(item)
    return acc
  }, {})
  return (
    <section className="page-stack">
      <section className="card-panel">
        <p className="eyebrow">Evidence gallery</p>
        <h2>Screenshots</h2>
        <p className="muted">State, scenario, consistency, and UX screenshots captured by Sniffer.</p>
      </section>
      {screenshots.length === 0 && (
        <section className="card-panel empty-state">
          <h2>No screenshots found</h2>
          <p>Run an audit with crawl/scenario checks to populate evidence.</p>
        </section>
      )}
      {Object.entries(groups).map(([group, rows]) => (
        <section key={group} className="card-panel">
          <div className="section-heading compact">
            <h2>{group || 'states'}</h2>
            <span className="status-chip muted">{rows.length}</span>
          </div>
          <div className="screenshot-grid">
            {rows.map((item) => (
              <a key={item.relativePath} href={item.url} target="_blank" rel="noreferrer" className="screenshot-card">
                <img src={item.url} alt={`Sniffer screenshot ${item.name}`} />
                <span>{item.name}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </section>
  )
}
