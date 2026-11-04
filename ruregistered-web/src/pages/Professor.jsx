import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProfessor } from '../api'
import RatingBlock from '../components/Stars'
import Reviews from '../components/Reviews'

export default function Professor() {
  const { key } = useParams()
  const [prof, setProf] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setProf(null); setError('')
    getProfessor(key).then(setProf).catch((e) => setError(e.message))
  }, [key])

  if (error) return <p className="error">{error}</p>
  if (!prof) return <p className="muted">Loading professor...</p>

  return (
    <>
      <p><Link to="/">Back to search</Link></p>
      <h1>{prof.display_name}</h1>
      <div className="split rev">
      <div>
      <h2>Teaching this term</h2>
      <ul className="plain">
        {prof.courses.map((c) => (
          <li key={c.course_string} className="item">
            <Link to={`/courses/${c.course_string}`}>{c.course_string} {c.title}</Link>
          </li>
        ))}
      </ul>
      <Reviews professorKey={prof.key} />
      </div>
      <aside className="side">
      <h2>Ratings</h2>
      {prof.rmp ? (
        <>
          <RatingBlock label="RateMyProfessors" data={prof.rmp} />
          {prof.rmp.would_take_again_percent != null &&
            <p>{Math.round(prof.rmp.would_take_again_percent)}% would take again</p>}
          {prof.rmp.url && <p><a href={prof.rmp.url} target="_blank" rel="noreferrer">View on RateMyProfessors</a></p>}
        </>
      ) : (
        <p className="muted">No RateMyProfessors match found ({prof.match.status}).</p>
      )}
      </aside>
      </div>
    </>
  )
}
