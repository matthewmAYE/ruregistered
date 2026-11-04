// Pure helpers for the schedule page: turning sections into time blocks and finding clashes.
// Days use SOC codes: M T W H(Thursday) F S U. Times arrive as 24-hour "HH:MM".

export const DAY_ORDER = ['M', 'T', 'W', 'H', 'F', 'S', 'U']
export const DAY_LABEL = { M: 'Mon', T: 'Tue', W: 'Wed', H: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' }

export function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const mm = String(minutes % 60).padStart(2, '0')
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

// entries: [{ course, section }]. Meetings without a day or time (online, by arrangement) are skipped.
export function meetingBlocks(entries) {
  const blocks = []
  for (const { course, section } of entries) {
    for (const m of section.meeting_times || []) {
      const start = toMinutes(m.start)
      const end = toMinutes(m.end)
      if (!m.day || start == null || end == null || end <= start) continue
      blocks.push({
        sectionIndex: section.index, courseString: course.course_string, title: course.title,
        day: m.day, start, end, place: [m.building, m.room].filter(Boolean).join(' '),
      })
    }
  }
  return blocks
}

// Two meetings clash if they share a day and overlap. Back-to-back classes do not clash.
export function findConflicts(blocks) {
  const pairs = new Map()
  const ids = new Set()
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j]
      if (a.sectionIndex === b.sectionIndex || a.day !== b.day) continue
      if (a.start < b.end && b.start < a.end) {
        pairs.set([a.sectionIndex, b.sectionIndex].sort().join('|'), [a, b])
        ids.add(a.sectionIndex)
        ids.add(b.sectionIndex)
      }
    }
  }
  return { pairs: [...pairs.values()], ids }
}

// Hour-aligned vertical range of the week grid, 8 AM to 6 PM unless classes fall outside it
export function gridRange(blocks) {
  let start = 8 * 60, end = 18 * 60
  for (const b of blocks) {
    start = Math.min(start, Math.floor(b.start / 60) * 60)
    end = Math.max(end, Math.ceil(b.end / 60) * 60)
  }
  return { start, end }
}
