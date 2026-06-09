import { STACK } from './content'

// The "stack, explained" section — one card per tool, beginner-readable.
export default function StackCards() {
  return (
    <div className="stack-grid">
      {STACK.map(tool => (
        <div className="stack-card" key={tool.name}>
          <h3 className="stack-name">{tool.name}</h3>
          <p className="stack-what">{tool.what}</p>
          <p className="stack-job"><span className="stack-label">Here:</span> {tool.job}</p>
          <p className="stack-why"><span className="stack-label">Why:</span> {tool.why}</p>
        </div>
      ))}
    </div>
  )
}
