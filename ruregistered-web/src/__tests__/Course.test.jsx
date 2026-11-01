import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Course from '../pages/Course'
import { getCourse } from '../api'

vi.mock('../api', () => ({ getCourse: vi.fn() }))
vi.mock('../components/Reviews', () => ({
  default: ({ courseString }) => <div>reviews for {courseString}</div>,
}))

const courseData = {
  course_string: '01:198:111', title: 'INTRO COMPUTER SCI', credits: 4,
  subject_description: 'COMPUTER SCIENCE', description: 'Learn to program.',
  prerequisites: null,
  instructors: [{ key: 'smith-john', display_name: 'John Smith' }],
  ratings: {
    rmp_this_course: { avg_rating: 4.1, avg_difficulty: 3.2, num_ratings: 30 },
    rmp_instructor_average: null,
  },
  sections: [
    {
      index: '12345', number: '01', open: true,
      instructors: [{ key: 'smith-john', display_name: 'John Smith', rmp: { avg_rating: 4.5 } }],
      meeting_times: [{ by_arrangement: false, day_name: 'Monday', start_display: '10:20 AM',
                        end_display: '11:40 AM', building: 'HLL', room: '116' }],
    },
    {
      index: '12346', number: '02', open: false, instructors: [],
      meeting_times: [{ by_arrangement: true }],
    },
  ],
}

const renderCourse = () =>
  render(
    <MemoryRouter initialEntries={['/courses/01:198:111']}>
      <Routes><Route path="/courses/:courseString" element={<Course />} /></Routes>
    </MemoryRouter>
  )

beforeEach(() => { vi.mocked(getCourse).mockReset() })

describe('Course page', () => {
  it('shows a loading state, then the course', async () => {
    getCourse.mockResolvedValue(courseData)
    renderCourse()
    expect(screen.getByText(/loading course/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'INTRO COMPUTER SCI' })).toBeInTheDocument()
    expect(getCourse).toHaveBeenCalledWith('01:198:111')
    expect(screen.getByText('Learn to program.')).toBeInTheDocument()
  })

  it('shows RMP ratings and a placeholder when missing', async () => {
    getCourse.mockResolvedValue(courseData)
    renderCourse()
    expect(await screen.findByText(/4\.1\/5 quality/)).toBeInTheDocument()
    expect(screen.getByText(/instructor average: no ratings yet/i)).toBeInTheDocument()
  })

  it('lists sections with open/closed status, instructors and times', async () => {
    getCourse.mockResolvedValue(courseData)
    renderCourse()
    expect(await screen.findByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'John Smith' })).toHaveAttribute('href', '/professors/smith-john')
    expect(screen.getByText(/Monday 10:20 AM-11:40 AM/)).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
    expect(screen.getByText('By arrangement')).toBeInTheDocument()
  })

  it('renders the reviews section for this course', async () => {
    getCourse.mockResolvedValue(courseData)
    renderCourse()
    expect(await screen.findByText('reviews for 01:198:111')).toBeInTheDocument()
  })

  it('shows an error for an unknown course', async () => {
    getCourse.mockRejectedValue(new Error('No course 01:198:111 in this term'))
    renderCourse()
    expect(await screen.findByText(/No course 01:198:111/)).toBeInTheDocument()
  })
})
