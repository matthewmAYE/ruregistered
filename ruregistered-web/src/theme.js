import { useEffect, useState } from 'react'

// 'system' follows the OS setting, 'light' and 'dark' are explicit choices saved in the browser
const KEY = 'theme'
const ORDER = ['system', 'light', 'dark']

function read() {
  try {
    const saved = localStorage.getItem(KEY)
    return ORDER.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

function apply(theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

apply(read()) // runs once on load so the saved theme is in place before the first paint

export function useTheme() {
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    apply(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* private mode: just skip saving */ }
  }, [theme])
  const cycle = () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length])
  return { theme, cycle }
}
