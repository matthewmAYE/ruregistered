// Thin wrapper over the Python (FastAPI) service.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function get(path, params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, v)
  }
  const query = qs.toString()
  const res = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export const searchCourses = (params) => get('/v1/courses', params)
export const getCourse = (cs) => get(`/v1/courses/${encodeURIComponent(cs)}`)
export const getProfessor = (key) => get(`/v1/professors/${encodeURIComponent(key)}`)
export const listSubjects = () => get('/v1/subjects')
