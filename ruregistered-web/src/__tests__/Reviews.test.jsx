import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Reviews from '../components/Reviews'

const mocks = vi.hoisted(() => ({
  user: null,
  select: { data: [], error: null },
  insert: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve(mocks.select) }) }),
      insert: (row) => mocks.insert(row),
      delete: () => ({ eq: (col, val) => mocks.remove(col, val) }),
    }),
  },
}))

const instructors = [{ key: 'smith-john', display_name: 'John Smith' }]
const review = (over = {}) => ({
  id: 'r1', user_id: 'other', course_string: '01:198:111', professor_key: 'smith-john',
  quality: 4, difficulty: 3, comment: 'Solid class', created_at: '2026-10-01T12:00:00Z', ...over,
})

const renderReviews = () =>
  render(<MemoryRouter><Reviews courseString="01:198:111" instructors={instructors} /></MemoryRouter>)

beforeEach(() => {
  mocks.user = null
  mocks.select = { data: [], error: null }
  mocks.insert.mockReset().mockResolvedValue({ error: null })
  mocks.remove.mockReset().mockResolvedValue({ error: null })
})

describe('Reviews', () => {
  it('shows an empty state and a login prompt when logged out', async () => {
    renderReviews()
    expect(await screen.findByText(/no student reviews yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'Post review' })).not.toBeInTheDocument()
  })

  it('lists reviews with averages and professor link', async () => {
    mocks.select = { data: [review(), review({ id: 'r2', quality: 2, difficulty: 5, professor_key: null, comment: null })], error: null }
    renderReviews()
    expect(await screen.findByText('Solid class')).toBeInTheDocument()
    expect(screen.getByText('3.0/5')).toBeInTheDocument() // average quality (4 + 2) / 2
    expect(screen.getByText('4.0/5')).toBeInTheDocument() // average difficulty (3 + 5) / 2
    expect(screen.getByRole('link', { name: 'John Smith' })).toHaveAttribute('href', '/professors/smith-john')
  })

  it('shows a load error', async () => {
    mocks.select = { data: null, error: { message: 'permission denied' } }
    renderReviews()
    expect(await screen.findByText('permission denied')).toBeInTheDocument()
  })

  it('submits a review for the logged-in user', async () => {
    mocks.user = { id: 'u1', email: 'a@scarletmail.rutgers.edu' }
    renderReviews()
    await screen.findByText(/no student reviews yet/i)
    await userEvent.selectOptions(screen.getByLabelText(/professor/i), 'smith-john')
    const quality = screen.getByLabelText(/quality/i)
    await userEvent.clear(quality)
    await userEvent.type(quality, '4')
    await userEvent.type(screen.getByLabelText('Comment'), '  Great  ')
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({
      user_id: 'u1', course_string: '01:198:111', professor_key: 'smith-john',
      quality: 4, difficulty: 3, comment: 'Great',
    }))
  })

  it('sends null professor and comment when left blank', async () => {
    mocks.user = { id: 'u1' }
    renderReviews()
    await screen.findByText(/no student reviews yet/i)
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ professor_key: null, comment: null, quality: 5 })))
  })

  it('explains a duplicate review', async () => {
    mocks.user = { id: 'u1' }
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    renderReviews()
    await screen.findByText(/no student reviews yet/i)
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText(/already reviewed this course/i)).toBeInTheDocument()
  })

  it('lets users delete only their own reviews', async () => {
    mocks.user = { id: 'u1' }
    mocks.select = { data: [review({ id: 'mine', user_id: 'u1' }), review({ id: 'theirs' })], error: null }
    renderReviews()
    const buttons = await screen.findAllByRole('button', { name: 'Delete' })
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('id', 'mine'))
  })
})
