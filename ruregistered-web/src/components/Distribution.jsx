// Horizontal bars showing how many reviews gave each score, 5 down to 1.
// `values` is a plain list of scores, e.g. [5, 4, 4, 2]
export default function Distribution({ values }) {
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: values.filter((v) => v === n).length }))
  const max = Math.max(1, ...counts.map((c) => c.count))
  const summary = counts.map((c) => `${c.n} stars: ${c.count}`).join(', ')
  return (
    <div className="dist" role="img" aria-label={`Rating distribution. ${summary}`}>
      {counts.map(({ n, count }) => (
        <div className="dist-row" key={n}>
          <span className="dist-n">{n}</span>
          <span className="dist-track"><span style={{ width: `${(count / max) * 100}%` }} /></span>
          <span className="dist-count">{count}</span>
        </div>
      ))}
    </div>
  )
}
