import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Schedule from '../pages/Schedule'
import { getCourse } from '../api'

vi.mock('../api', () => ({ getCourse: vi.fn() }))
const saved = vi.hoisted(() => ({ signedIn: true, ready: true, error: '', items: [], toggle: vi.fn() }))
vi.mock('../saved', () => ({ useSaved: () => saved }))

const section = (index, number, meetings, open = true) => ({
  index, number, open, instructors: [{ display_name: 'John Smith' }],
  meeting_times: meetings.map(([day, day_name, start, end]) => ({
    day, day_name, start, end, start_display: start, end_display: end, building: 'HLL', room: '116', by_arrangement: false })),
})
const courses = {
  '01:198:111': { course_string: '01:198:111', title: 'INTRO CS', credits: 4,
    sections: [section('111', '01', [['M', 'Monday', '10:00', '11:00']]), section('112', '02', [['T', 'Tuesday', '10:00', '11:00']])] },
  '01:640:151': { course_string: '01:640:151', title: 'CALC 1', credits: 4,
    sections: [section('151', '01', [['M', 'Monday', '10:30', '11:30']], false)] },
}
const item = (id, kind, item_id, course_string) => ({ id, kind, item_id, course_string })

const renderPage = () => render(<MemoryRouter><Schedule /></MemoryRouter>)

beforeEach(() => {
  saved.signedIn = true; saved.ready = true; saved.error = ''; saved.items = []
  saved.toggle.mockReset()
  getCourse.mockReset().mockImplementation((cs) =>
    courses[cs] ? Promise.resolve(courses[cs]) : Promise.reject(new Error('not found')))
})

describe('Schedule page', () => {
  it('asks logged-out visitors to log in', () => {
    saved.signedIn = false
    renderPage()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('shows an empty state', async () => {
    renderPage()
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no saved courses/i)).toBeInTheDocument()
  })

  it('lists saved sections with credits, status and registration indexes', async () => {
    saved.items = [item('a', 'section', '111', '01:198:111'), item('b', 'section', '112', '01:198:111')]
    renderPage()
    expect(await screen.findByText('2 sections, 4 credits')).toBeInTheDocument()
    expect(screen.getByText('111, 112')).toBeInTheDocument()
    expect(screen.queryByText(/time conflict/i)).not.toBeInTheDocument()
    expect(getCourse).toHaveBeenCalledTimes(1) // one fetch per distinct course
  })

  it('warns about overlapping sections', async () => {
    saved.items = [item('a', 'section', '111', '01:198:111'), item('b', 'section', '151', '01:640:151')]
    renderPage()
    expect(await screen.findByText(/time conflict: 01:198:111 and 01:640:151 overlap on Mon/i)).toBeInTheDocument()
    expect(screen.getAllByText('(conflict)')).toHaveLength(2)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('removes a section', async () => {
    saved.items = [item('a', 'section', '111', '01:198:111')]
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(saved.toggle).toHaveBeenCalledWith('section', '111', '01:198:111')
  })

  it('flags sections that are no longer offered', async () => {
    saved.items = [item('a', 'section', '999', '01:198:111')]
    renderPage()
    expect(await screen.findByText(/section 999 of 01:198:111 is no longer/i)).toBeInTheDocument()
  })

  it('lists saved courses and lets you unsave them', async () => {
    saved.items = [item('c', 'course', '01:640:151', '01:640:151')]
    renderPage()
    expect(await screen.findByRole('link', { name: '01:640:151 CALC 1' })).toHaveAttribute('href', '/courses/01:640:151')
    await userEvent.click(screen.getByRole('button', { name: 'Unsave' }))
    expect(saved.toggle).toHaveBeenCalledWith('course', '01:640:151', '01:640:151')
  })
})
