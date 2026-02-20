'use client'

import { useEffect } from 'react'

declare global {
  // eslint-disable-next-line no-var
  var __appVersion: string | undefined
}

function safeGetItem(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage errors (Safari private/PWA restrictions)
  }
}

export function AppVersionChecker() {
  useEffect(() => {
    let interval: number | undefined

    const checkUpdate = async () => {
      try {
        const res = await fetch('/version', { cache: 'no-store' })
        const data = await res.json()
        const current = String(data?.version ?? '')
        if (!current) return

        const stored = safeGetItem('app-version')
        const memory = globalThis.__appVersion

        if ((stored && stored !== current) || (memory && memory !== current)) {
          safeSetItem('app-version', current)
          globalThis.__appVersion = current
          window.location.reload()
          return
        }

        if (!stored) safeSetItem('app-version', current)
        if (!globalThis.__appVersion) globalThis.__appVersion = current
      } catch {
        // ignore
      }
    }

    checkUpdate()
    interval = window.setInterval(checkUpdate, 5 * 60 * 1000)

    const onFocus = () => checkUpdate()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkUpdate()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (interval) window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
