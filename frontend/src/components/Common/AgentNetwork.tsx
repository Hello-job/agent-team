// A restrained, living constellation of "agents" — the product's one big idea,
// drawn rather than described. Pure SVG + CSS (see index.css net-* keyframes);
// purely decorative, so it's aria-hidden and ignores pointer events.

type Node = { x: number; y: number; accent?: boolean; delay?: number }

const ACCENT = '#2ed3e6'
const MUTED = '#7c8593'

const hub: Node = { x: 250, y: 150, accent: true }
const nodes: Node[] = [
  { x: 90, y: 85, accent: true, delay: 0.2 },
  { x: 130, y: 238, delay: 1.1 },
  { x: 385, y: 90, accent: true, delay: 0.6 },
  { x: 422, y: 206, delay: 1.6 },
  { x: 300, y: 50, delay: 0.9 },
  { x: 176, y: 262, delay: 1.9 },
]

// Edges: hub → every satellite, plus a few cross-links for depth.
const edges: [Node, Node][] = [
  ...nodes.map((n) => [hub, n] as [Node, Node]),
  [nodes[0], nodes[1]],
  [nodes[2], nodes[3]],
  [nodes[4], nodes[2]],
]
// Which edges carry an animated "signal".
const flowEdges: [Node, Node][] = [
  [hub, nodes[0]],
  [hub, nodes[2]],
]

export function AgentNetwork({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 300"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="net-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
          <stop offset="55%" stopColor={ACCENT} stopOpacity="0.06" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Glow behind the hub */}
      <circle cx={hub.x} cy={hub.y} r="170" fill="url(#net-glow)" />

      {/* Edges */}
      <g strokeLinecap="round">
        {edges.map(([a, b], i) => (
          <line
            key={`e${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}
        {flowEdges.map(([a, b], i) => (
          <line
            key={`f${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={ACCENT}
            strokeOpacity="0.55"
            strokeWidth="1"
            className="net-flow"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </g>

      {/* Nodes */}
      {[hub, ...nodes].map((n, i) => (
        <g key={`n${i}`}>
          {n.accent && (
            <circle
              cx={n.x}
              cy={n.y}
              r="9"
              fill="none"
              stroke={ACCENT}
              strokeWidth="1.25"
              className="net-ring"
              style={{ animationDelay: `${n.delay ?? 0}s` }}
            />
          )}
          <circle
            cx={n.x}
            cy={n.y}
            r={n.accent ? (i === 0 ? 5.5 : 4.5) : 3.5}
            fill={n.accent ? ACCENT : MUTED}
            className={n.accent ? undefined : 'net-node'}
            style={n.accent ? undefined : { animationDelay: `${n.delay ?? 0}s` }}
          />
        </g>
      ))}
    </svg>
  )
}
