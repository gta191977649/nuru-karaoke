import { useEffect, useMemo, useState } from 'react'
import App from './App.jsx'
import Synth from './synth/Synth.jsx'
import SynthProvider from './synth/SynthProvider.jsx'

function normalizePathname(pathname) {
  if (!pathname) return '/'
  return pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname
}

function Root() {
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname))

  useEffect(() => {
    const onPop = () => setPathname(normalizePathname(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useMemo(() => {
    return (to) => {
      const next = normalizePathname(to)
      if (next === pathname) return
      window.history.pushState({}, '', next)
      setPathname(next)
    }
  }, [pathname])

  const page = useMemo(() => {
    if (pathname === '/synth' || pathname === '/debug') return <Synth onNavigateHome={() => navigate('/')} />
    return <App onNavigate={navigate} />
  }, [navigate, pathname])

  return <SynthProvider>{page}</SynthProvider>
}

export default Root
