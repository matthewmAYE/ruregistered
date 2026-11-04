import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext({ user: null, isAdmin: false })
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false) // true for people listed in the admins table

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) { setIsAdmin(false); return }
    setIsAdmin(null) // unknown until the lookup finishes
    supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(!!data))
  }, [user?.id])

  return <AuthContext.Provider value={{ user, isAdmin }}>{children}</AuthContext.Provider>
}
