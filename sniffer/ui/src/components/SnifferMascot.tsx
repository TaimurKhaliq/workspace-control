export type MascotState = 'idle' | 'sniffing' | 'success' | 'error'

export function SnifferMascot({ state }: { state: MascotState }) {
  return (
    <div className={`mascot-card ${state}`} aria-label="Sniffer golden retriever mascot" role="img">
      <svg className="sniffer-dog" viewBox="0 0 220 150" aria-hidden="true">
        <g className="tail">
          <path d="M55 88 C21 78 20 44 44 40 C36 58 49 68 70 70" fill="none" stroke="#c48a28" strokeWidth="13" strokeLinecap="round" />
        </g>
        <ellipse cx="112" cy="88" rx="58" ry="36" fill="#d99a32" />
        <ellipse cx="125" cy="86" rx="45" ry="31" fill="#e8ad4d" />
        <g className="head">
          <circle cx="164" cy="61" r="34" fill="#e8ad4d" />
          <path d="M138 49 C129 20 152 18 159 42" fill="#b87926" />
          <path d="M181 47 C196 22 215 36 191 61" fill="#b87926" />
          <ellipse className="nose" cx="192" cy="66" rx="12" ry="9" fill="#2d2622" />
          <circle cx="174" cy="54" r="3.5" fill="#1f2937" />
          <path d="M180 75 Q171 82 160 75" fill="none" stroke="#8a5d23" strokeWidth="3" strokeLinecap="round" />
        </g>
        <path d="M80 114 L72 139" stroke="#b87926" strokeWidth="12" strokeLinecap="round" />
        <path d="M131 115 L139 139" stroke="#b87926" strokeWidth="12" strokeLinecap="round" />
        <ellipse cx="72" cy="139" rx="13" ry="5" fill="#8a5d23" />
        <ellipse cx="139" cy="139" rx="13" ry="5" fill="#8a5d23" />
        <g className="scent">
          <path d="M204 51 C218 42 214 31 203 26" fill="none" stroke="#93a4b8" strokeWidth="3" strokeLinecap="round" />
          <path d="M205 72 C221 72 225 61 216 55" fill="none" stroke="#93a4b8" strokeWidth="3" strokeLinecap="round" />
          <path d="M198 88 C209 99 222 94 222 83" fill="none" stroke="#93a4b8" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
      <div>
        <strong>{stateLabel(state)}</strong>
        <span>{stateCopy(state)}</span>
      </div>
    </div>
  )
}

function stateLabel(state: MascotState): string {
  if (state === 'sniffing') return 'Sniffing the UI'
  if (state === 'success') return 'Clean trail'
  if (state === 'error') return 'Needs attention'
  return 'Ready to sniff'
}

function stateCopy(state: MascotState): string {
  if (state === 'sniffing') return 'Watching phases, screenshots, and findings.'
  if (state === 'success') return 'Latest run completed successfully.'
  if (state === 'error') return 'The last run stopped with an error.'
  return 'Launch an audit when your app is running.'
}
