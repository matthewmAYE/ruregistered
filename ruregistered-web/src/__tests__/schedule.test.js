import { describe, expect, it } from 'vitest'
import { findConflicts, formatTime, gridRange, meetingBlocks, toMinutes } from '../schedule'

const entry = (index, course_string, meetings) => ({
  course: { course_string, title: course_string },
  section: { index, meeting_times: meetings },
})
const meet = (day, start, end, building = 'HLL', room = '116') => ({ day, start, end, building, room })

describe('schedule helpers', () => {
  it('converts times', () => {
    expect(toMinutes('10:20')).toBe(620)
    expect(toMinutes(null)).toBeNull()
    expect(toMinutes('930')).toBeNull()
    expect(formatTime(13 * 60 + 5)).toBe('1:05 PM')
    expect(formatTime(0)).toBe('12:00 AM')
  })

  it('builds blocks and skips meetings without a day or time', () => {
    const blocks = meetingBlocks([
      entry('1', 'A', [meet('M', '10:20', '11:40'), { day: null, start: null, end: null }, meet('W', '11:00', '10:00')]),
    ])
    expect(blocks).toEqual([expect.objectContaining({ sectionIndex: '1', day: 'M', start: 620, end: 700, place: 'HLL 116' })])
  })

  it('detects overlaps but not back-to-back classes or different days', () => {
    const clash = findConflicts(meetingBlocks([
      entry('1', 'A', [meet('M', '10:00', '11:00')]),
      entry('2', 'B', [meet('M', '10:30', '11:30')]),
    ]))
    expect(clash.pairs).toHaveLength(1)
    expect([...clash.ids].sort()).toEqual(['1', '2'])

    const fine = findConflicts(meetingBlocks([
      entry('1', 'A', [meet('M', '10:00', '11:00')]),
      entry('2', 'B', [meet('M', '11:00', '12:00')]),
      entry('3', 'C', [meet('T', '10:00', '11:00')]),
    ]))
    expect(fine.pairs).toHaveLength(0)
  })

  it('reports each clashing pair of sections once', () => {
    const { pairs } = findConflicts(meetingBlocks([
      entry('1', 'A', [meet('M', '10:00', '11:00'), meet('W', '10:00', '11:00')]),
      entry('2', 'B', [meet('M', '10:00', '11:00'), meet('W', '10:00', '11:00')]),
    ]))
    expect(pairs).toHaveLength(1)
  })

  it('keeps the grid at 8 to 6 unless classes fall outside', () => {
    expect(gridRange([])).toEqual({ start: 480, end: 1080 })
    expect(gridRange([{ start: 7 * 60 + 30, end: 20 * 60 + 10 }])).toEqual({ start: 420, end: 1260 })
  })
})
