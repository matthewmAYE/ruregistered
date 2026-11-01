import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login from '../pages/Login'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}))
vi.mock('../supabase', () => ({ supabase: { auth } }))

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>
  )

async function fill(email = 'a@b.edu', password = 'secret1') {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

beforeEach(() => {
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: null })
  auth.signUp.mockReset().mockResolvedValue({ error: null })
})

describe('Login page', () => {
  it('logs in and goes home', async () => {
    renderLogin()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.edu', password: 'secret1' }))
    expect(await screen.findByText('home page')).toBeInTheDocument()
  })

  it('shows the error for bad credentials and stays on the page', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    renderLogin()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
    expect(screen.queryByText('home page')).not.toBeInTheDocument()
  })

  it('switches to sign up and tells the user to confirm their email', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /need an account/i }))
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith({ email: 'a@b.edu', password: 'secret1' }))
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(screen.queryByText('home page')).not.toBeInTheDocument()
  })
})
