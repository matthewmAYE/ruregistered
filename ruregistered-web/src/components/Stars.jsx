// Shows an RMP-style summary block: { avg_rating, avg_difficulty, num_ratings }
export default function RatingBlock({ label, data }) {
  if (!data || data.avg_rating == null) return <p className="muted">{label}: no ratings yet</p>
  return (
    <p>
      <strong>{label}:</strong> {data.avg_rating.toFixed(1)}/5 quality
      {data.avg_difficulty != null && <>, {data.avg_difficulty.toFixed(1)}/5 difficulty</>}
      <span className="muted"> ({data.num_ratings} ratings)</span>
    </p>
  )
}
