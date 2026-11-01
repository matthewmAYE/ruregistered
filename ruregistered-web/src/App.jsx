import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { supabase } from './supabase'
import Search from './pages/Search'
import Course from './pages/Course'
import Professor from './pages/Professor'
import Login from './pages/Login'

export default function App() {
  const { user } = useAuth()
  return (
    <>
      <header className="bar">
        <Link to="/" className="brand">RUregistered</Link>
        <nav>
          {user ? (
            <>
              <span className="muted">{user.email}</span>
              <button className="link" onClick={() => supabase.auth.signOut()}>Log out</button>
            </>
          ) : (
            <Link to="/login">Log in</Link>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/courses/:courseString" element={<Course />} />
          <Route path="/professors/:key" element={<Professor />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  )
}
