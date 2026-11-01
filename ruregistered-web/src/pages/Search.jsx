import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchCourses } from '../api'

const PAGE = 25

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const openOnly = params.get('open') === '1'
  const sort = params.get('sort') || ''
  const offset = Number(params.get('offset') || 0)
  const [text, setText] = useState(q)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    searchCourses({ q, open_only: openOnly, sort, limit: PAGE, offset })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [q, openOnly, sort, offset])

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
          placeholder="Title, 198:111, or professor name" aria-label="Search courses" />
        <button type="submit">Search</button>
      </form>
      <div className="row">
        <label><input type="checkbox" checked={openOnly}
          onChange={(e) => update({ open: e.target.checked ? '1' : '' })} /> Open sections only</label>
        <label>Sort{' '}
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="">Best match</option>
            <option value="course">Course number</option>
            <option value="rating">Rating</option>
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading courses...</p>}
      {data && (
        <>
          <p className="muted">{data.total} courses</p>
          <ul className="plain">
            {data.results.map((c) => {
              const r = c.ratings.rmp_this_course || c.ratings.rmp_instructor_average
              return (
                <li key={c.course_string} className="item">
                  <Link to={`/courses/${c.course_string}`}>{c.course_string} {c.title}</Link>
                  <div className="muted">
                    {c.credits} credits, {c.sections_open}/{c.sections_total} sections open
                    {r && <>, RMP {r.avg_rating.toFixed(1)}/5</>}
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
