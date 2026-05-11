import { useMemo, useState } from 'react'
import { artifactUrl } from '../artifacts'

export interface ScreenshotContext {
  src: string
  title: string
  subtitle?: string
  details?: string[]
  artifactUrl?: string
  sourcePath?: string
}

export function ScreenshotModal({ screenshot, projectId, onClose }: { screenshot: ScreenshotContext | null; projectId?: string; onClose: () => void }) {
  if (!screenshot) return null
  const src = screenshot.artifactUrl ?? artifactUrl(screenshot.src, projectId)
  const copyValue = screenshot.sourcePath ?? screenshot.src
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
              {(screenshot.details?.length ? screenshot.details : ['Context unavailable']).map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={() => copyToClipboard(copyValue)}>Copy path</button>
              <a className="secondary-button" href={src} target="_blank" rel="noreferrer">Open artifact</a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function copyToClipboard(value: string) {
  void navigator.clipboard?.writeText(value)
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
