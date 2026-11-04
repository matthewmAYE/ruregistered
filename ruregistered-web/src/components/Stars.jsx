// Bar showing value out of 5, drawn with CSS so it needs no extra text
const Meter = ({ value, tone }) => (
  <div className={`meter ${tone || ''}`} aria-hidden="true">
    <span style={{ width: `${Math.min(100, Math.max(0, (value / 5) * 100))}%` }} />
  </div>
)

// Shows an RMP-style summary block: { avg_rating, avg_difficulty, num_ratings }
export default function RatingBlock({ label, data }) {
  if (!data || data.avg_rating == null) return <p className="muted">{label}: no ratings yet</p>
  return (
    <div className="rating">
      <p>
        <strong>{label}:</strong> {data.avg_rating.toFixed(1)}/5 quality
        {data.avg_difficulty != null && <>, {data.avg_difficulty.toFixed(1)}/5 difficulty</>}
        <span className="muted"> ({data.num_ratings} ratings)</span>
      </p>
      <Meter value={data.avg_rating} />
      {data.avg_difficulty != null && <Meter value={data.avg_difficulty} tone="alt" />}
    </div>
  )
}
