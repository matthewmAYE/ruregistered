import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { useTheme } from './theme'
import Search from './pages/Search'
import Course from './pages/Course'
import Professor from './pages/Professor'
import Login from './pages/Login'
import Schedule from './pages/Schedule'
import Admin from './pages/Admin'

export default function App() {
  const { user, isAdmin } = useAuth()
  const { theme, cycle } = useTheme()
  return (
    <>
      <header className="bar">
        <Link to="/" className="brand">RUregistered</Link>
        <nav>
          <button className="ghost" onClick={cycle} title="Switch between system, light and dark">Theme: {theme}</button>
          {user ? (
            <>
              <Link to="/schedule">My schedule</Link>
              {isAdmin === true && <Link to="/admin">Moderation</Link>}
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
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  )
}
