import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Distribution from '../components/Distribution'

describe('Distribution', () => {
  it('counts each score and describes the chart for screen readers', () => {
    render(<Distribution values={[5, 5, 3, 1]} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Rating distribution. 5 stars: 2, 4 stars: 0, 3 stars: 1, 2 stars: 0, 1 stars: 1')
  })

  it('scales bars against the largest count', () => {
    const { container } = render(<Distribution values={[5, 5, 5, 3]} />)
    const widths = [...container.querySelectorAll('.dist-track span')].map((el) => el.style.width)
    expect(widths).toEqual(['100%', '0%', expect.stringMatching(/^33\.3/), '0%', '0%'])
  })

  it('handles no reviews', () => {
    const { container } = render(<Distribution values={[]} />)
    expect([...container.querySelectorAll('.dist-track span')].every((el) => el.style.width === '0%')).toBe(true)
  })
})
