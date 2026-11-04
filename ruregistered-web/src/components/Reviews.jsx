import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import Distribution from './Distribution'

// Student reviews stored in Supabase. Two modes:
//  - courseString: reviews for one course, with a form to post one (instructors from the API: [{ key, display_name }])
//  - professorKey: read-only list of reviews that mention one professor, across courses
export default function Reviews({ courseString, professorKey, instructors = [] }) {
  const { user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState(null) // id of the review whose report form is open
  const [reported, setReported] = useState([])
  const [reportForm, setReportForm] = useState({ reason: 'spam', details: '' })
  const [form, setForm] = useState({ professor_key: '', quality: 5, difficulty: 3, comment: '' })

  async function load() {
    const [column, value] = professorKey ? ['professor_key', professorKey] : ['course_string', courseString]
    const { data, error } = await supabase.from('reviews').select('*')
      .eq(column, value).order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setReviews(data)
  }
  useEffect(() => { load() }, [courseString, professorKey])

  async function submit(e) {
    e.preventDefault()
    setError('')
    const scores = [Number(form.quality), Number(form.difficulty)]
    if (!scores.every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
      setError('Quality and difficulty must be whole numbers from 1 to 5.')
      return
    }
    const { error } = await supabase.from('reviews').insert({
      user_id: user.id,
      course_string: courseString,
      professor_key: form.professor_key || null,
      quality: scores[0],
      difficulty: scores[1],
      comment: form.comment.trim() || null,
    })
    if (error) {
      setError(error.code === '23505' ? 'You already reviewed this course with that professor.' : error.message)
      return
    }
    setForm({ ...form, comment: '' })
    load()
  }

  async function sendReport(e, review) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('reports').insert({
      review_id: review.id, reporter_id: user.id,
      reason: reportForm.reason, details: reportForm.details.trim() || null,
    })
    // 23505 means this user already reported it, which is fine to treat as done
    if (error && error.code !== '23505') { setError(error.message); return }
    setReported([...reported, review.id])
    setReporting(null)
  }

  async function remove(id) {
    await supabase.from('reviews').delete().eq('id', id)
    load()
  }

  const nameFor = (key) => instructors.find((i) => i.key === key)?.display_name || key
  const avg = (field) => reviews.length
    ? (reviews.reduce((s, r) => s + r[field], 0) / reviews.length).toFixed(1) : null

  return (
    <section>
      <h2>Student reviews</h2>
      {reviews.length > 0 && (
        <p><strong>{avg('quality')}/5</strong> quality, <strong>{avg('difficulty')}/5</strong> difficulty
          <span className="muted"> ({reviews.length} reviews)</span></p>
      )}
      {reviews.length > 0 && <Distribution values={reviews.map((r) => r.quality)} />}
      {error && <p className="error">{error}</p>}

      {professorKey ? null : user ? (
        <form onSubmit={submit} className="review-form">
          <label>Professor
            <select value={form.professor_key} onChange={(e) => setForm({ ...form, professor_key: e.target.value })}>
              <option value="">Not specific</option>
              {instructors.map((i) => <option key={i.key} value={i.key}>{i.display_name}</option>)}
            </select>
          </label>
          <label>Quality (1-5)
            <input type="number" min="1" max="5" value={form.quality}
              onChange={(e) => setForm({ ...form, quality: e.target.value })} />
          </label>
          <label>Difficulty (1-5)
            <input type="number" min="1" max="5" value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value })} />
          </label>
          <label>Comment
            <textarea rows="3" value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </label>
          <button type="submit">Post review</button>
        </form>
      ) : (
        <p><Link to="/login">Log in</Link> to write a review.</p>
      )}

      {reviews.length === 0 && <p className="muted">
        {professorKey ? 'No student reviews yet. Reviews are written on course pages.' : 'No student reviews yet. Be the first.'}
      </p>}
      <ul className="plain">
        {reviews.map((r) => (
          <li key={r.id} className="review">
            <div>
              <strong>{r.quality}/5 quality, {r.difficulty}/5 difficulty</strong>
              {professorKey && <> in <Link to={`/courses/${r.course_string}`}>{r.course_string}</Link></>}
              {!professorKey && r.professor_key && <> with <Link to={`/professors/${r.professor_key}`}>{nameFor(r.professor_key)}</Link></>}
            </div>
            {r.comment && <p>{r.comment}</p>}
            <span className="muted">{new Date(r.created_at).toLocaleDateString()}</span>
            {user?.id === r.user_id && <button className="link" onClick={() => remove(r.id)}>Delete</button>}
            {user && user.id !== r.user_id && (reported.includes(r.id)
              ? <span className="muted"> Reported, thanks.</span>
              : <button className="link" onClick={() => { setReporting(r.id); setReportForm({ reason: 'spam', details: '' }) }}>Report</button>)}
            {reporting === r.id && (
              <form className="review-form" onSubmit={(e) => sendReport(e, r)}>
                <label>Reason
                  <select value={reportForm.reason} onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })}>
                    <option value="spam">Spam</option>
                    <option value="offensive">Offensive or abusive</option>
                    <option value="irrelevant">Not relevant</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>Details (optional)
                  <input value={reportForm.details} onChange={(e) => setReportForm({ ...reportForm, details: e.target.value })} />
                </label>
                <div className="row">
                  <button type="submit">Send report</button>
                  <button type="button" className="link" onClick={() => setReporting(null)}>Cancel</button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
