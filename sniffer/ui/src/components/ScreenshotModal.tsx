import { useMemo, useState } from 'react'
import { artifactUrl } from '../artifacts'

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
          <ScreenshotImage src={src} alt={screenshot.title} />
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

export function ScreenshotImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState('')
  const failed = failedSrc === src
  const label = useMemo(() => {
    try {
      const url = new URL(src, window.location.origin)
      return decodeURIComponent(url.pathname.split('/').pop() ?? 'screenshot')
    } catch {
      return 'screenshot'
    }
  }, [src])

  if (failed) {
    return (
      <div className={`screenshot-placeholder ${className ?? ''}`} role="status" aria-label={`${alt} unavailable`}>
        <strong>Screenshot unavailable</strong>
        <span>{label}</span>
      </div>
    )
  }

  return <img className={className} src={src} alt={alt} onError={() => setFailedSrc(src)} />
}

export { artifactUrl }
