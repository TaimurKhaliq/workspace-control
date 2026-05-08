import { useEffect, useState } from 'react'
import type { FixPacketItem, Issue, SnifferReport } from '../api'
import { getFixPacket } from '../api'
import { ReportContextStrip } from './ReportContextStrip'

export function FixPacketViewer({
  report,
  packets,
  projectId,
  projectName,
  onGenerateFixes
}: {
  report?: SnifferReport | null
  packets: FixPacketItem[]
  projectId?: string
  projectName?: string
  onGenerateFixes: () => void
}) {
  const [selected, setSelected] = useState(packets[0]?.issueId ?? '')
  const [markdown, setMarkdown] = useState('')
  const issue = report?.issues.find((item) => item.issue_id === selected)

  useEffect(() => {
    if (!selected && packets[0]) setSelected(packets[0].issueId)
  }, [packets, selected])

  useEffect(() => {
    if (!selected) {
      setMarkdown('')
      return
    }
    void getFixPacket(selected, projectId).then(setMarkdown).catch((error) => setMarkdown(String(error)))
  }, [selected, projectId])
  const sections = splitFixPacketMarkdown(markdown)

  return (
    <section className="page-stack">
      <ReportContextStrip report={report} projectId={projectId} projectName={projectName} />
      <div className="report-grid">
        <div className="summary-column">
          <section className="card-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Repair packets</p>
                <h2>Fix Packets</h2>
                <p className="muted">One repair packet per actionable triaged issue. Select a packet to inspect the prompt, files, and verification path.</p>
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
                    <span title={packet.issueId}>{packet.issueId}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="detail-column">
          <section className="card-panel sticky-detail fix-packet-detail">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Selected packet</p>
                <h2>{selected ? issueTitle(report, selected) : 'Fix packet detail'}</h2>
              </div>
              {selected && <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(markdown)}>Copy prompt</button>}
            </div>
            {issue && <PacketIssue issue={issue} />}
            {selected ? <PacketSections markdown={markdown} sections={sections} issue={issue} /> : <p className="muted">Select a fix packet to inspect the Codex-ready prompt.</p>}
          </section>
        </aside>
      </div>
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
          {issue.suspected_files.slice(0, 8).map((file) => <code key={file} title={file}>{file}</code>)}
        </div>
      )}
    </div>
  )
}

function PacketSections({ markdown, sections, issue }: { markdown: string; sections: FixPacketSection[]; issue?: Issue }) {
  if (!markdown) return <p className="muted">Loading fix packet...</p>
  const prompt = sectionBody(sections, 'Prompt') || sectionBody(sections, 'Header') || issue?.fix_prompt || issue?.suggestedFixPrompt || ''
  const suspected = sectionBody(sections, 'Suspected Files')
  const verification = sectionBody(sections, 'Verification')
  const constraints = sectionBody(sections, 'Constraints')
  return (
    <div className="fix-packet-sections">
      {prompt && (
        <details open className="packet-section-card">
          <summary>Prompt</summary>
          <pre>{prompt.trim()}</pre>
        </details>
      )}
      {(suspected || issue?.suspected_files?.length) && (
        <details open className="packet-section-card">
          <summary>Suspected files</summary>
          {suspected ? <pre>{suspected.trim()}</pre> : <div className="file-list">{issue?.suspected_files?.map((file) => <code key={file} title={file}>{file}</code>)}</div>}
        </details>
      )}
      {verification && (
        <details className="packet-section-card">
          <summary>Verification</summary>
          <pre>{verification.trim()}</pre>
        </details>
      )}
      {constraints && (
        <details className="packet-section-card">
          <summary>Constraints</summary>
          <pre>{constraints.trim()}</pre>
        </details>
      )}
      <details className="packet-section-card">
        <summary>Raw packet markdown</summary>
        <pre>{markdown}</pre>
      </details>
    </div>
  )
}

function issueTitle(report: SnifferReport | null | undefined, issueId: string): string {
  return report?.issues.find((issue) => issue.issue_id === issueId)?.title ?? issueId
}

interface FixPacketSection {
  title: string
  body: string
}

function splitFixPacketMarkdown(markdown: string): FixPacketSection[] {
  const sections: FixPacketSection[] = []
  const lines = markdown.split(/\r?\n/)
  let current: FixPacketSection = { title: 'Header', body: '' }
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/)
    if (match) {
      sections.push(current)
      current = { title: match[1], body: '' }
    } else {
      current.body += `${line}\n`
    }
  }
  sections.push(current)
  return sections.filter((section) => section.body.trim())
}

function sectionBody(sections: FixPacketSection[], title: string): string {
  return sections.find((section) => section.title.toLowerCase() === title.toLowerCase())?.body ?? ''
}
