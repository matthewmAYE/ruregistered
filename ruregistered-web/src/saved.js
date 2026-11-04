import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// The signed-in user's saved courses and schedule sections (table: saved_items).
// kind is 'course' (id = course string) or 'section' (id = section index).
export function useSaved() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) { setItems([]); setReady(true); return }
    setReady(false)
    supabase.from('saved_items').select('*').eq('user_id', user.id).order('created_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setItems(data)
        setReady(true)
      })
  }, [user?.id])

  const has = (kind, id) => items.some((i) => i.kind === kind && i.item_id === id)

  // Saves the item if it is not saved yet, otherwise removes it
  async function toggle(kind, id, courseString) {
    if (!user) return
    setError('')
    const existing = items.find((i) => i.kind === kind && i.item_id === id)
    if (existing) {
      const { error } = await supabase.from('saved_items').delete().eq('id', existing.id)
      if (error) return setError(error.message)
      setItems((all) => all.filter((i) => i.id !== existing.id))
    } else {
      const { data, error } = await supabase.from('saved_items')
        .insert({ user_id: user.id, kind, item_id: id, course_string: courseString })
        .select().single()
      if (error) return setError(error.message)
      setItems((all) => [...all, data])
    }
  }

  return { items, ready, error, has, toggle, signedIn: !!user }
}
