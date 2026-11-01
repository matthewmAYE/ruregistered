import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'

// Student reviews for one course, stored in Supabase.
// `instructors` is the list from the API: [{ key, display_name }]
export default function Reviews({ courseString, instructors }) {
  const { user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [error, setError] = useState('')
  const [form, setForm] = useState({ professor_key: '', quality: 5, difficulty: 3, comment: '' })

  async function load() {
    const { data, error } = await supabase.from('reviews').select('*')
      .eq('course_string', courseString).order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setReviews(data)
  }
  useEffect(() => { load() }, [courseString])

  async function submit(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('reviews').insert({
      user_id: user.id,
      course_string: courseString,
      professor_key: form.professor_key || null,
      quality: Number(form.quality),
      difficulty: Number(form.difficulty),
      comment: form.comment.trim() || null,
    })
    if (error) {
      setError(error.code === '23505' ? 'You already reviewed this course with that professor.' : error.message)
      return
    }
    setForm({ ...form, comment: '' })
    load()
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
      {error && <p className="error">{error}</p>}

      {user ? (
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

      {reviews.length === 0 && <p className="muted">No student reviews yet. Be the first.</p>}
      <ul className="plain">
        {reviews.map((r) => (
          <li key={r.id} className="review">
            <div>
              <strong>{r.quality}/5 quality, {r.difficulty}/5 difficulty</strong>
              {r.professor_key && <> with <Link to={`/professors/${r.professor_key}`}>{nameFor(r.professor_key)}</Link></>}
            </div>
            {r.comment && <p>{r.comment}</p>}
            <span className="muted">{new Date(r.created_at).toLocaleDateString()}</span>
            {user?.id === r.user_id && <button className="link" onClick={() => remove(r.id)}>Delete</button>}
          </li>
        ))}
      </ul>
    </section>
  )
}
