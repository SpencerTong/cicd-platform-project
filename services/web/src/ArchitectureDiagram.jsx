// Hand-built SVG of the GitOps loop, themed to the Terminal/Ops palette.
// Scales cleanly via viewBox (no fixed raster). Reused later in the README.
export default function ArchitectureDiagram() {
  // Seven nodes left-to-right; labels under each. Colors match the page theme:
  // panels #0f172a, borders #334155, accent green #4ade80 / cyan #7dd3fc.
  const nodes = [
    { x: 20,   label: 'git push',       sub: 'commit' },
    { x: 185,  label: 'GitHub Actions', sub: 'build · test · scan' },
    { x: 360,  label: 'GHCR',           sub: 'image pushed' },
    { x: 510,  label: 'CD',             sub: 'bump Helm tag' },
    { x: 660,  label: 'ArgoCD',         sub: 'detect + sync' },
    { x: 820,  label: 'k3s',            sub: 'rollout' },
    { x: 960,  label: 'live',           sub: 'serving' },
  ]
  const NODE_W = 120
  const NODE_H = 50
  const Y = 40

  return (
    <svg viewBox="0 0 1100 140" width="100%" role="img"
         aria-label="GitOps loop: git push to GitHub Actions to GHCR to CD to ArgoCD to k3s to live"
         style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 4 }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#4ade80" />
        </marker>
      </defs>

      {nodes.map((n, i) => (
        <g key={n.label}>
          {/* connector arrow from previous node */}
          {i > 0 && (
            <line
              x1={nodes[i - 1].x + NODE_W} y1={Y + NODE_H / 2}
              x2={n.x} y2={Y + NODE_H / 2}
              stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow)" />
          )}
          {/* node box */}
          <rect x={n.x} y={Y} width={NODE_W} height={NODE_H} rx="6"
                fill="#0b1020" stroke="#334155" strokeWidth="1" />
          <text x={n.x + NODE_W / 2} y={Y + 22} textAnchor="middle"
                fill="#7dd3fc" fontSize="13" fontFamily="monospace" fontWeight="700">{n.label}</text>
          <text x={n.x + NODE_W / 2} y={Y + 38} textAnchor="middle"
                fill="#64748b" fontSize="9" fontFamily="monospace">{n.sub}</text>
        </g>
      ))}

      {/* GitOps reconcile loop arrow: ArgoCD watches Git (curved back) */}
      <path d="M 720 38 C 720 8, 80 8, 80 38" fill="none" stroke="#334155"
            strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#arrow)" />
      <text x="400" y="14" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">
        ArgoCD continuously reconciles the cluster to match Git
      </text>
    </svg>
  )
}
