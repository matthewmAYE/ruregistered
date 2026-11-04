import { DAY_LABEL, DAY_ORDER, formatTime, gridRange } from '../schedule'

const PX_PER_HOUR = 48

// Weekly calendar of meeting blocks. Hidden from screen readers because the section list beside it says the same thing.
export default function WeekGrid({ blocks, conflictIds }) {
  const { start, end } = gridRange(blocks)
  const days = DAY_ORDER.filter((d) => 'MTWHF'.includes(d) || blocks.some((b) => b.day === d))
  const hours = []
  for (let t = start; t < end; t += 60) hours.push(t)
  const columns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }
  const y = (minutes) => ((minutes - start) / 60) * PX_PER_HOUR

  return (
    <div className="week" aria-hidden="true">
      <div className="week-head" style={columns}>
        <span />
        {days.map((d) => <span key={d}>{DAY_LABEL[d]}</span>)}
      </div>
      <div className="week-body" style={{ ...columns, height: ((end - start) / 60) * PX_PER_HOUR }}>
        <div className="week-hours">
          {hours.map((t) => <span key={t} style={{ top: y(t) }}>{formatTime(t).replace(':00', '')}</span>)}
        </div>
        {days.map((d) => (
          <div className="week-col" key={d}>
            {blocks.filter((b) => b.day === d).map((b) => (
              <div key={`${b.sectionIndex}-${b.start}`}
                className={`block${conflictIds.has(b.sectionIndex) ? ' clash' : ''}`}
                style={{ top: y(b.start), height: y(b.end) - y(b.start) }}>
                <strong>{b.courseString}</strong>
                <span>{b.place}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
