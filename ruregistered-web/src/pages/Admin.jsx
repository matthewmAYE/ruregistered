import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'

const REASONS = { spam: 'Spam', offensive: 'Offensive or abusive', irrelevant: 'Not relevant', other: 'Other' }

// Moderation queue: reviews that users reported. Only visible to people listed in the admins table.
export default function Admin() {
  const { user, isAdmin } = useAuth()
  const [queue, setQueue] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('reports')
      .select('id, review_id, reason, details, created_at, reviews(id, course_string, professor_key, quality, difficulty, comment)')
      .order('created_at', { ascending: true })
    if (error) return setError(error.message)
    const byReview = new Map()
    for (const r of data) {
      if (!r.reviews) continue
      if (!byReview.has(r.review_id)) byReview.set(r.review_id, { review: r.reviews, reports: [] })
      byReview.get(r.review_id).reports.push(r)
    }
    setQueue([...byReview.values()])
  }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function dismiss(reviewId) {
    const { error } = await supabase.from('reports').delete().eq('review_id', reviewId)
    if (error) setError(error.message)
    load()
  }
  async function remove(reviewId) {
    if (!window.confirm('Delete this review permanently?')) return
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
    if (error) setError(error.message)
    load()
  }

  if (!user) return <p><Link to="/login">Log in</Link> to continue.</p>
  if (isAdmin === null) return <p className="muted">Checking access...</p>
  if (!isAdmin) return <p>You do not have access to this page.</p>

  return (
    <>
      <h1>Moderation</h1>
      {error && <p className="error">{error}</p>}
      {!queue && !error && <p className="muted">Loading reports...</p>}
      {queue && queue.length === 0 && <p className="muted">No reported reviews.</p>}
      <ul className="plain">
        {queue?.map(({ review, reports }) => (
          <li key={review.id} className="item">
            <strong>{review.quality}/5 quality, {review.difficulty}/5 difficulty</strong> on{' '}
            <Link to={`/courses/${review.course_string}`}>{review.course_string}</Link>
            {review.comment ? <p>{review.comment}</p> : <p className="muted">No comment</p>}
            <ul className="plain">
              {reports.map((r) => (
                <li key={r.id} className="muted">
                  {REASONS[r.reason] || r.reason}{r.details && `: ${r.details}`}
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="ghost" onClick={() => dismiss(review.id)}>Keep review</button>
              <button onClick={() => remove(review.id)}>Delete review</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
