import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Search from '../pages/Search'
import { searchCourses } from '../api'

vi.mock('../api', () => ({ searchCourses: vi.fn() }))

const course = (over = {}) => ({
  course_string: '01:198:111', title: 'INTRO COMPUTER SCI', credits: 4,
  sections_open: 2, sections_total: 5,
  ratings: { rmp_this_course: { avg_rating: 4.2 }, rmp_instructor_average: null },
  ...over,
})

const renderSearch = (path = '/') =>
  render(<MemoryRouter initialEntries={[path]}><Search /></MemoryRouter>)

beforeEach(() => { vi.mocked(searchCourses).mockReset() })

describe('Search page', () => {
  it('shows results with open sections and rating', async () => {
    searchCourses.mockResolvedValue({ total: 1, results: [course()] })
    renderSearch()
    expect(await screen.findByText(/01:198:111 INTRO COMPUTER SCI/)).toBeInTheDocument()
    expect(screen.getByText(/2\/5 sections open/)).toBeInTheDocument()
    expect(screen.getByText(/RMP 4\.2\/5/)).toBeInTheDocument()
  })

  it('falls back to the instructor average when no course-specific rating', async () => {
    searchCourses.mockResolvedValue({
      total: 1,
      results: [course({ ratings: { rmp_this_course: null, rmp_instructor_average: { avg_rating: 3.5 } } })],
    })
    renderSearch()
    expect(await screen.findByText(/RMP 3\.5\/5/)).toBeInTheDocument()
  })

  it('omits the rating when there is none', async () => {
    searchCourses.mockResolvedValue({
      total: 1, results: [course({ ratings: { rmp_this_course: null, rmp_instructor_average: null } })],
    })
    renderSearch()
    await screen.findByText(/01:198:111/)
    expect(screen.queryByText(/RMP/)).not.toBeInTheDocument()
  })

  it('shows an error when the API fails', async () => {
    searchCourses.mockRejectedValue(new Error('SOC courses.json fetch failed'))
    renderSearch()
    expect(await screen.findByText(/SOC courses.json fetch failed/)).toBeInTheDocument()
  })

  it('searches with the typed query', async () => {
    searchCourses.mockResolvedValue({ total: 0, results: [] })
    renderSearch()
    await userEvent.type(screen.getByLabelText('Search courses'), 'calculus')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(searchCourses).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'calculus', offset: 0 })))
  })

  it('reads filters from the URL', async () => {
    searchCourses.mockResolvedValue({ total: 0, results: [] })
    renderSearch('/?q=bio&open=1&sort=rating')
    await waitFor(() =>
      expect(searchCourses).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'bio', open_only: true, sort: 'rating' })))
    expect(screen.getByLabelText(/open sections only/i)).toBeChecked()
  })

  it('disables paging at the ends and advances with Next', async () => {
    searchCourses.mockResolvedValue({ total: 60, results: [course()] })
    renderSearch()
    await screen.findByText(/01:198:111/)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(searchCourses).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })))
  })

  it('disables Next on the last page', async () => {
    searchCourses.mockResolvedValue({ total: 10, results: [course()] })
    renderSearch()
    await screen.findByText(/01:198:111/)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
