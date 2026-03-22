'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  // eslint-disable-next-line no-var
  var __appVersion: string | undefined
}

const VERSION_KEY = 'app-version'

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
    // ignore storage errors
  }
}

export function AppVersionChecker() {
  const baselineVersionRef = useRef<string | null>(null)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [latestVersion, setLatestVersion] = useState('')

  useEffect(() => {
    let interval: number | undefined
    let inFlight = false

    const checkUpdate = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const res = await fetch('/version', { cache: 'no-store' })
        const data = await res.json()
        const current = String(data?.version ?? '')
        if (!current) return

        const stored = safeGetItem(VERSION_KEY)
        const memory = globalThis.__appVersion

        if (!baselineVersionRef.current) {
          baselineVersionRef.current = stored || memory || current
          if (!stored) safeSetItem(VERSION_KEY, baselineVersionRef.current)
          if (!memory) globalThis.__appVersion = baselineVersionRef.current
        }

        if (baselineVersionRef.current && current !== baselineVersionRef.current) {
          setLatestVersion(current)
          setHasUpdate(true)
        }
      } catch {
        // ignore
      } finally {
        inFlight = false
      }
    }

    void checkUpdate()
    interval = window.setInterval(() => {
      void checkUpdate()
    }, 5 * 60 * 1000)

    const onFocus = () => void checkUpdate()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkUpdate()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (interval) window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (!hasUpdate) return null

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[100] rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 md:left-auto md:right-4 md:w-[420px]">
      <p className="text-sm font-medium">Nuova versione disponibile</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Aggiorna la pagina per applicare le ultime modifiche.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
          onClick={() => setHasUpdate(false)}
        >
          Dopo
        </button>
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          onClick={() => {
            if (latestVersion) {
              safeSetItem(VERSION_KEY, latestVersion)
              globalThis.__appVersion = latestVersion
            }
            window.location.reload()
          }}
        >
          Aggiorna ora
        </button>
      </div>
    </div>
  )
}
