import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCourse } from '../api'
import { useSaved } from '../saved'
import { DAY_LABEL, findConflicts, meetingBlocks } from '../schedule'
import WeekGrid from '../components/WeekGrid'

export default function Schedule() {
  const saved = useSaved()
  const [courses, setCourses] = useState({}) // course string -> course detail, or { error }
  const courseStrings = [...new Set(saved.items.map((i) => i.course_string))].sort()
  const wanted = courseStrings.join('|')

  // One API call per distinct course gives titles, credits and every section's meeting times
  useEffect(() => {
    let cancelled = false
    Promise.all(courseStrings.map((cs) =>
      getCourse(cs).then((c) => [cs, c]).catch((e) => [cs, { error: e.message }])
    )).then((pairs) => { if (!cancelled) setCourses(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [wanted])

  if (!saved.signedIn) {
    return <><h1>My schedule</h1><p><Link to="/login">Log in</Link> to save courses and plan your schedule.</p></>
  }
  if (!saved.ready || courseStrings.some((cs) => !courses[cs])) return <p className="muted">Loading schedule...</p>

  const sectionItems = saved.items.filter((i) => i.kind === 'section')
  const entries = []
  const missing = []
  for (const item of sectionItems) {
    const course = courses[item.course_string]
    const section = course?.sections?.find((s) => s.index === item.item_id)
    if (section) entries.push({ course, section }); else missing.push(item)
  }
  const blocks = meetingBlocks(entries)
  const { pairs, ids } = findConflicts(blocks)
  const credits = [...new Map(entries.map((e) => [e.course.course_string, e.course.credits])).values()]
    .reduce((sum, c) => sum + (Number(c) || 0), 0)
  const savedCourses = saved.items.filter((i) => i.kind === 'course')

  return (
    <>
      <h1>My schedule</h1>
      {saved.error && <p className="error">{saved.error}</p>}
      <p className="muted">{entries.length} sections, {credits} credits</p>

      {pairs.map(([a, b]) => (
        <p key={`${a.sectionIndex}-${b.sectionIndex}`} className="error">
          Time conflict: {a.courseString} and {b.courseString} overlap on {DAY_LABEL[a.day]}.
        </p>
      ))}

      {entries.length === 0 && (
        <p>Nothing here yet. Open a course and choose "Add to schedule" on a section.</p>
      )}
      {entries.length > 0 && (
        <>
          <WeekGrid blocks={blocks} conflictIds={ids} />
          <h2>Sections</h2>
          <ul className="plain">
            {entries.map(({ course, section }) => (
              <li key={section.index} className="item">
                <Link to={`/courses/${course.course_string}`}>{course.course_string} {course.title}</Link>{' '}
                <span className={section.open ? 'open' : 'closed'}>{section.open ? 'Open' : 'Closed'}</span>
                {ids.has(section.index) && <span className="error"> (conflict)</span>}
                <div className="muted">
                  Section {section.number}, index {section.index}
                  {section.instructors.length > 0 && <>, {section.instructors.map((i) => i.display_name).join(', ')}</>}
                </div>
                <div className="muted">
                  {section.meeting_times.map((m, n) => (
                    <div key={n}>
                      {m.by_arrangement ? 'No fixed time' : `${m.day_name} ${m.start_display}-${m.end_display}`}
                      {m.building && `, ${m.building} ${m.room || ''}`}
                    </div>
                  ))}
                </div>
                <button className="link" onClick={() => saved.toggle('section', section.index, course.course_string)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <h2>Registration indexes</h2>
          <p><code>{entries.map((e) => e.section.index).join(', ')}</code></p>
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(entries.map((e) => e.section.index).join(', '))}>
            Copy indexes
          </button>
        </>
      )}

      {missing.map((item) => (
        <p key={item.id} className="muted">
          Section {item.item_id} of {item.course_string} is no longer in the schedule of classes.{' '}
          <button className="link" onClick={() => saved.toggle('section', item.item_id, item.course_string)}>Remove</button>
        </p>
      ))}

      <h2>Saved courses</h2>
      {savedCourses.length === 0 && <p className="muted">No saved courses. Use "Save course" on a course page.</p>}
      <ul className="plain">
        {savedCourses.map((item) => {
          const course = courses[item.course_string]
          return (
            <li key={item.id} className="item">
              <Link to={`/courses/${item.course_string}`}>
                {item.course_string}{course?.title ? ` ${course.title}` : ''}
              </Link>{' '}
              <button className="link" onClick={() => saved.toggle('course', item.item_id, item.course_string)}>Unsave</button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
