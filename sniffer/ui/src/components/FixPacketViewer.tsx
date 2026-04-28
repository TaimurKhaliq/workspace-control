import { useEffect, useState } from 'react'
import type { FixPacketItem, Issue, SnifferReport } from '../api'
import { getFixPacket } from '../api'

export function FixPacketViewer({
  report,
  packets,
  onGenerateFixes
}: {
  report?: SnifferReport | null
  packets: FixPacketItem[]
  onGenerateFixes: () => void
}) {
  const [selected, setSelected] = useState(packets[0]?.issueId ?? '')
  const [markdown, setMarkdown] = useState('')
  const issue = report?.issues.find((item) => item.issue_id === selected)

  useEffect(() => {
    if (!selected) {
      setMarkdown('')
      return
    }
    void getFixPacket(selected).then(setMarkdown).catch((error) => setMarkdown(String(error)))
  }, [selected])

  return (
    <section className="report-grid">
      <div className="summary-column">
        <section className="card-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Repair packets</p>
              <h2>Fix Packets</h2>
            </div>
            <button type="button" className="primary-button" onClick={onGenerateFixes}>Generate Fix Packets</button>
          </div>
          {packets.length === 0 ? (
            <p className="muted">No fix packets found. Generate packets after an audit with actionable issues.</p>
          ) : (
            <div className="packet-list">
              {[...new Map(packets.map((packet) => [packet.issueId, packet])).values()].map((packet) => (
                <button
                  key={packet.issueId}
                  type="button"
                  className={selected === packet.issueId ? 'packet-item active' : 'packet-item'}
                  onClick={() => setSelected(packet.issueId)}
                >
                  <strong>{issueTitle(report, packet.issueId)}</strong>
                  <span>{packet.issueId}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <aside className="detail-column">
        <section className="card-panel sticky-detail">
          <div className="section-heading compact">
            <h2>{selected ? issueTitle(report, selected) : 'Fix packet detail'}</h2>
            {selected && <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(markdown)}>Copy prompt</button>}
          </div>
          {issue && <PacketIssue issue={issue} />}
          <pre className="markdown-preview">{markdown || 'Select a fix packet to inspect the Codex-ready prompt.'}</pre>
        </section>
      </aside>
    </section>
  )
}

function PacketIssue({ issue }: { issue: Issue }) {
  return (
    <div className="packet-issue">
      <div className="chip-row">
        <span className="status-chip warn">{issue.severity}</span>
        <span className="status-chip muted">{issue.type.replace(/_/g, ' ')}</span>
      </div>
      <p>{issue.description}</p>
      {issue.suspected_files && issue.suspected_files.length > 0 && (
        <div className="file-list">
          {issue.suspected_files.slice(0, 5).map((file) => <code key={file}>{file}</code>)}
        </div>
      )}
    </div>
  )
}

function issueTitle(report: SnifferReport | null | undefined, issueId: string): string {
  return report?.issues.find((issue) => issue.issue_id === issueId)?.title ?? issueId
}
