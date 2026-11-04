import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSaved } from '../saved'

const mocks = vi.hoisted(() => ({
  user: { id: 'u1' }, rows: { data: [], error: null }, insert: vi.fn(), remove: vi.fn(),
}))
vi.mock('../auth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve(mocks.rows) }) }),
      insert: (row) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
      delete: () => ({ eq: (col, val) => mocks.remove(col, val) }),
    }),
  },
}))

const row = { id: 's1', kind: 'section', item_id: '111', course_string: '01:198:111' }

beforeEach(() => {
  mocks.user = { id: 'u1' }
  mocks.rows = { data: [row], error: null }
  mocks.insert.mockReset().mockImplementation((r) => Promise.resolve({ data: { id: 'new', ...r }, error: null }))
  mocks.remove.mockReset().mockResolvedValue({ error: null })
})

describe('useSaved', () => {
  it('loads the user\'s saved items', async () => {
    const { result } = renderHook(() => useSaved())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.has('section', '111')).toBe(true)
    expect(result.current.has('course', '111')).toBe(false)
  })

  it('saves a new item', async () => {
    const { result } = renderHook(() => useSaved())
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(() => result.current.toggle('course', '01:198:111', '01:198:111'))
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: 'u1', kind: 'course', item_id: '01:198:111', course_string: '01:198:111' })
    expect(result.current.has('course', '01:198:111')).toBe(true)
  })

  it('removes an item that is already saved', async () => {
    const { result } = renderHook(() => useSaved())
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(() => result.current.toggle('section', '111', '01:198:111'))
    expect(mocks.remove).toHaveBeenCalledWith('id', 's1')
    expect(result.current.has('section', '111')).toBe(false)
  })

  it('keeps the item and reports the error when saving fails', async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const { result } = renderHook(() => useSaved())
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(() => result.current.toggle('course', 'x', 'x'))
    expect(result.current.error).toBe('permission denied')
    expect(result.current.has('course', 'x')).toBe(false)
  })

  it('does nothing when signed out', async () => {
    mocks.user = null
    const { result } = renderHook(() => useSaved())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.signedIn).toBe(false)
    await act(() => result.current.toggle('course', 'x', 'x'))
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
