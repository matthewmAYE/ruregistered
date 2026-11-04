import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { isRutgersEmail } from '../rutgers'

const RUTGERS_ONLY = 'Please sign up with your Rutgers ScarletMail address (netid@scarletmail.rutgers.edu).'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function submit(e) {
    e.preventDefault()
    setMessage('')
    // Friendly early check, the database enforces the same rule
    if (mode === 'signup' && !isRutgersEmail(email)) {
      return setMessage(RUTGERS_ONLY)
    }
    const { error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    // Supabase hides the database rule behind a generic message so it is translated here
    if (error?.message?.includes('Database error saving new user')) {
      return setMessage(RUTGERS_ONLY)
    }
    if (error) return setMessage(error.message)
    if (mode === 'signup') return setMessage('Check your email to confirm your account, then log in.')
    navigate('/')
  }

  return (
    <>
      <h1>{mode === 'login' ? 'Log in' : 'Create an account'}</h1>
      {mode === 'signup' && (
        <p className="muted">Accounts are for Rutgers students. Use your ScarletMail address so we know reviews come from real classmates.</p>
      )}
      <form onSubmit={submit} className="review-form">
        <label>Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="netid@scarletmail.rutgers.edu" autoComplete="email" />
        </label>
        <label>Password
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      </form>
      {message && <p className="error">{message}</p>}
      <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
      </button>
    </>
  )
}
