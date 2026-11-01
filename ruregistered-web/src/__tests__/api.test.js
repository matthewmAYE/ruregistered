import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCourse, getProfessor, searchCourses } from '../api'

function mockFetch(body, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('builds the query string and skips empty values', async () => {
    const fetchFn = mockFetch({ results: [] })
    await searchCourses({ q: 'calc', open_only: false, sort: '', limit: 25, offset: 0 })
    const url = fetchFn.mock.calls[0][0]
    expect(url).toContain('/v1/courses?')
    expect(url).toContain('q=calc')
    expect(url).toContain('limit=25')
    expect(url).not.toContain('open_only')
    expect(url).not.toContain('sort')
  })

  it('keeps offset 0 and open_only=true', async () => {
    const fetchFn = mockFetch({})
    await searchCourses({ open_only: true, offset: 0 })
    const url = fetchFn.mock.calls[0][0]
    expect(url).toContain('open_only=true')
    expect(url).toContain('offset=0')
  })

  it('encodes course strings and professor keys in the path', async () => {
    const fetchFn = mockFetch({})
    await getCourse('01:198:111')
    await getProfessor('smith-john')
    expect(fetchFn.mock.calls[0][0]).toContain('/v1/courses/01%3A198%3A111')
    expect(fetchFn.mock.calls[1][0]).toContain('/v1/professors/smith-john')
  })

  it('throws the API detail message on errors', async () => {
    mockFetch({ detail: 'No course 01:198:999 in this term' }, false, 404)
    await expect(getCourse('01:198:999')).rejects.toThrow('No course 01:198:999 in this term')
  })

  it('falls back to a status message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 502, json: () => Promise.reject(new Error('bad json')),
    }))
    await expect(getCourse('x')).rejects.toThrow('Request failed (502)')
  })
})
