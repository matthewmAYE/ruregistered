import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Professor from '../pages/Professor'
import { getProfessor } from '../api'

vi.mock('../api', () => ({ getProfessor: vi.fn() }))

const base = {
  key: 'smith-john', display_name: 'John Smith',
  match: { status: 'matched', confidence: 'exact' },
  courses: [{ course_string: '01:198:111', title: 'INTRO COMPUTER SCI' }],
}

const renderProf = () =>
  render(
    <MemoryRouter initialEntries={['/professors/smith-john']}>
      <Routes><Route path="/professors/:key" element={<Professor />} /></Routes>
    </MemoryRouter>
  )

beforeEach(() => { vi.mocked(getProfessor).mockReset() })

describe('Professor page', () => {
  it('shows RMP details, would-take-again and courses', async () => {
    getProfessor.mockResolvedValue({
      ...base,
      rmp: { avg_rating: 4.4, avg_difficulty: 2.9, num_ratings: 80,
             would_take_again_percent: 87.4, url: 'https://www.ratemyprofessors.com/professor/1' },
    })
    renderProf()
    expect(await screen.findByRole('heading', { name: 'John Smith' })).toBeInTheDocument()
    expect(screen.getByText(/4\.4\/5 quality/)).toBeInTheDocument()
    expect(screen.getByText('87% would take again')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view on ratemyprofessors/i }))
      .toHaveAttribute('href', 'https://www.ratemyprofessors.com/professor/1')
    expect(screen.getByRole('link', { name: /01:198:111/ })).toHaveAttribute('href', '/courses/01:198:111')
  })

  it('explains when there is no RMP match', async () => {
    getProfessor.mockResolvedValue({ ...base, match: { status: 'ambiguous' }, rmp: null })
    renderProf()
    expect(await screen.findByText(/no ratemyprofessors match found \(ambiguous\)/i)).toBeInTheDocument()
  })

  it('shows an error when the professor is not found', async () => {
    getProfessor.mockRejectedValue(new Error("No instructor 'smith-john' in this term"))
    renderProf()
    expect(await screen.findByText(/No instructor/)).toBeInTheDocument()
  })
})
