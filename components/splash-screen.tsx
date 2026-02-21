'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export function SplashScreen() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const hide = () => setVisible(false)
    const timeout = window.setTimeout(hide, 800)
    window.addEventListener('load', hide, { once: true })
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('load', hide)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <Image src="/logo.png" alt="Amico Fritto" width={240} height={96} priority />
        <p className="text-sm font-medium tracking-wide text-slate-600">Delivery app</p>
      </div>
    </div>
  )
}
