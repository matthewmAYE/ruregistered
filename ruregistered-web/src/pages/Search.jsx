import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listSubjects, searchCourses } from '../api'

const PAGE = 25

// Picks the rating to show on a result, student reviews first and RateMyProfessors as a fallback
export function headlineRating(ratings) {
  if (ratings?.student_reviews) return { ...ratings.student_reviews, source: 'Students' }
  const rmp = ratings?.rmp_this_course || ratings?.rmp_instructor_average
  return rmp ? { ...rmp, source: 'RMP' } : null
}

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const subject = params.get('subject') || ''
  const openOnly = params.get('open') === '1'
  const sort = params.get('sort') || ''
  const offset = Number(params.get('offset') || 0)
  const [text, setText] = useState(q)
  const [subjects, setSubjects] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  // Loads the department list once for the dropdown
  useEffect(() => {
    listSubjects().then((r) => setSubjects(r.results)).catch(() => setSubjects([]))
  }, [])

  useEffect(() => {
    setError('')
    searchCourses({ q, subject, open_only: openOnly, sort, limit: PAGE, offset })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [q, subject, openOnly, sort, offset])

  // Writes filter changes into the URL so searches can be shared and the back button works
  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries({ offset: 0, ...changes })) {
      if (v) next.set(k, v); else next.delete(k)
    }
    setParams(next)
  }

  return (
    <>
      <h1>Find a course</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() }) }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Title, 198:111, department 332, or professor" aria-label="Search courses" />
        <button type="submit">Search</button>
      </form>
      <div className="row">
        <label>Department{' '}
          <select value={subject} onChange={(e) => update({ subject: e.target.value })}>
            <option value="">All departments</option>
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>{s.code} {s.description}</option>
            ))}
          </select>
        </label>
        <label>Sort{' '}
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="">Best match</option>
            <option value="course">Course number</option>
            <option value="rating">Highest rated</option>
          </select>
        </label>
        <label><input type="checkbox" checked={openOnly}
          onChange={(e) => update({ open: e.target.checked ? '1' : '' })} /> Open sections only</label>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading courses...</p>}
      {data && (
        <>
          <p className="muted">{data.total} courses</p>
          {data.total === 0 && <p>No courses match. Try a shorter search or another department.</p>}
          <ul className="plain">
            {data.results.map((c) => {
              const r = headlineRating(c.ratings)
              return (
                <li key={c.course_string} className="item">
                  <Link to={`/courses/${c.course_string}`}>{c.course_string} {c.title}</Link>
                  <div className="muted">
                    {c.credits} credits, {c.sections_open}/{c.sections_total} sections open
                    {r && <>, {r.source} {r.avg_rating.toFixed(1)}/5 ({r.num_ratings})</>}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="row">
            <button disabled={offset === 0} onClick={() => update({ offset: Math.max(0, offset - PAGE) || '' })}>Previous</button>
            <button disabled={offset + PAGE >= data.total} onClick={() => update({ offset: offset + PAGE })}>Next</button>
          </div>
        </>
      )}
    </>
  )
}
