import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCourse } from '../api'
import RatingBlock from '../components/Stars'
import Reviews from '../components/Reviews'

export default function Course() {
  const { courseString } = useParams()
  const [course, setCourse] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setCourse(null); setError('')
    getCourse(courseString).then(setCourse).catch((e) => setError(e.message))
  }, [courseString])

  if (error) return <p className="error">{error}</p>
  if (!course) return <p className="muted">Loading course...</p>

  return (
    <>
      <p><Link to="/">Back to search</Link></p>
      <h1>{course.title}</h1>
      <p className="muted">{course.course_string}, {course.credits} credits, {course.subject_description}</p>
      {course.description && <p>{course.description}</p>}
      {course.prerequisites && <p><strong>Prerequisites:</strong> {course.prerequisites}</p>}

      <h2>RateMyProfessors</h2>
      <RatingBlock label="This course" data={course.ratings.rmp_this_course} />
      <RatingBlock label="Instructor average" data={course.ratings.rmp_instructor_average} />

      <h2>Sections</h2>
      <ul className="plain">
        {course.sections.map((s) => (
          <li key={s.index} className="item">
            <strong>Section {s.number}</strong> (index {s.index}){' '}
            <span className={s.open ? 'open' : 'closed'}>{s.open ? 'Open' : 'Closed'}</span>
            <div>
              {s.instructors.length === 0 && <span className="muted">Staff</span>}
              {s.instructors.map((i, n) => (
                <span key={i.key}>
                  {n > 0 && ', '}
                  <Link to={`/professors/${i.key}`}>{i.display_name}</Link>
                  {i.rmp?.avg_rating != null && <span className="muted"> ({i.rmp.avg_rating.toFixed(1)})</span>}
                </span>
              ))}
            </div>
            <div className="muted">
              {s.meeting_times.map((m, n) => (
                <div key={n}>
                  {m.by_arrangement ? 'By arrangement'
                    : `${m.day_name} ${m.start_display}-${m.end_display}`}
                  {m.building && `, ${m.building} ${m.room || ''}`}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <Reviews courseString={course.course_string} instructors={course.instructors} />
    </>
  )
}
