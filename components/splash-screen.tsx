'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

const HOME_PRODUCTS_READY_EVENT = 'af:home-products-ready'

type SplashScreenProps = {
  waitForHomeReady?: boolean
}

export function SplashScreen({ waitForHomeReady = false }: SplashScreenProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let loaded = document.readyState === 'complete'
    let homeReady = !waitForHomeReady
    let minDelayDone = false

    const hideIfReady = () => {
      if (loaded && homeReady && minDelayDone) {
        setVisible(false)
      }
    }

    const onWindowLoad = () => {
      loaded = true
      hideIfReady()
    }

    const onHomeReady = () => {
      homeReady = true
      hideIfReady()
    }

    const minDelay = window.setTimeout(() => {
      minDelayDone = true
      hideIfReady()
    }, waitForHomeReady ? 2600 : 800)

    // Safety fallback: never keep the splash forever if an event is missed.
    const hardStop = window.setTimeout(() => {
      setVisible(false)
    }, waitForHomeReady ? 12000 : 3000)

    window.addEventListener('load', onWindowLoad, { once: true })
    if (waitForHomeReady) {
      window.addEventListener(HOME_PRODUCTS_READY_EVENT, onHomeReady as EventListener)
    }

    hideIfReady()

    return () => {
      window.clearTimeout(minDelay)
      window.clearTimeout(hardStop)
      window.removeEventListener('load', onWindowLoad)
      if (waitForHomeReady) {
        window.removeEventListener(HOME_PRODUCTS_READY_EVENT, onHomeReady as EventListener)
      }
    }
  }, [waitForHomeReady])

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
