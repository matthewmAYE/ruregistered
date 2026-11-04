import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Admin from '../pages/Admin'

const mocks = vi.hoisted(() => ({ auth: { user: { id: 'a1' }, isAdmin: true }, reports: { data: [], error: null }, del: vi.fn() }))
vi.mock('../auth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../supabase', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({ order: () => Promise.resolve(mocks.reports) }),
      delete: () => ({ eq: (col, val) => mocks.del(table, col, val) }),
    }),
  },
}))

const review = { id: 'r1', course_string: '01:198:111', professor_key: null, quality: 1, difficulty: 5, comment: 'Awful words' }
const report = (id, reason, details = null, reviews = review) =>
  ({ id, review_id: 'r1', reason, details, created_at: '2026-10-01', reviews })

const renderAdmin = () => render(<MemoryRouter><Admin /></MemoryRouter>)

beforeEach(() => {
  mocks.auth = { user: { id: 'a1' }, isAdmin: true }
  mocks.reports = { data: [], error: null }
  mocks.del.mockReset().mockResolvedValue({ error: null })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Admin page', () => {
  it('blocks people who are not signed in or not admins', () => {
    mocks.auth = { user: null, isAdmin: false }
    renderAdmin()
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })

  it('denies non-admins', () => {
    mocks.auth = { user: { id: 'u1' }, isAdmin: false }
    renderAdmin()
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument()
  })

  it('shows an empty queue', async () => {
    renderAdmin()
    expect(await screen.findByText(/no reported reviews/i)).toBeInTheDocument()
  })

  it('groups reports by review', async () => {
    mocks.reports = { data: [report('p1', 'spam'), report('p2', 'offensive', 'rude words')], error: null }
    renderAdmin()
    expect(await screen.findByText('Awful words')).toBeInTheDocument()
    expect(screen.getAllByText('Awful words')).toHaveLength(1)
    expect(screen.getByText('Spam')).toBeInTheDocument()
    expect(screen.getByText('Offensive or abusive: rude words')).toBeInTheDocument()
  })

  it('dismisses reports but keeps the review', async () => {
    mocks.reports = { data: [report('p1', 'spam')], error: null }
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep review' }))
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('reports', 'review_id', 'r1'))
  })

  it('deletes a review after confirming', async () => {
    mocks.reports = { data: [report('p1', 'spam')], error: null }
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete review' }))
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('reviews', 'id', 'r1'))
  })

  it('does nothing if the admin cancels the confirmation', async () => {
    window.confirm.mockReturnValue(false)
    mocks.reports = { data: [report('p1', 'spam')], error: null }
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete review' }))
    expect(mocks.del).not.toHaveBeenCalled()
  })

  it('shows load errors', async () => {
    mocks.reports = { data: null, error: { message: 'permission denied' } }
    renderAdmin()
    expect(await screen.findByText('permission denied')).toBeInTheDocument()
  })
})
