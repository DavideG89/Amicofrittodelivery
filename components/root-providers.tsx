'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CartProvider } from '@/lib/cart-context'
import { FloatingCartButton } from '@/components/floating-cart-button'
import { Toaster } from '@/components/ui/sonner'
import { AppVersionChecker } from '@/components/app-version-checker'
import { InstallBanner } from '@/components/install-banner'
import { SplashScreen } from '@/components/splash-screen'
import { GlobalOrderTerminalDialog } from '@/components/global-order-terminal-dialog'

const creatorSiteUrl = process.env.NEXT_PUBLIC_CREATOR_SITE_URL?.trim() || ''

export function RootProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAdminPath = pathname.startsWith('/admin')
  const isHomePath = pathname === '/'
  const [canAnimate, setCanAnimate] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [transitionDirection, setTransitionDirection] = useState<'right' | 'left'>('right')
  const previousPathRef = useRef(pathname)
  const stackKeyRef = useRef('af-mobile-route-stack-v2')

  useEffect(() => {
    setCanAnimate(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (isAdminPath || !isMobile || !canAnimate) {
      previousPathRef.current = pathname
      return
    }

    if (pathname === previousPathRef.current) {
      return
    }

    let stack: string[] = []
    try {
      const raw = window.sessionStorage.getItem(stackKeyRef.current)
      const parsed = raw ? (JSON.parse(raw) as string[]) : []
      if (Array.isArray(parsed)) {
        stack = parsed.filter((entry) => typeof entry === 'string' && entry.length > 0)
      }
    } catch {
      stack = []
    }

    if (stack.length === 0) {
      stack = [previousPathRef.current]
    }

    const currentTop = stack[stack.length - 1]
    if (currentTop === pathname) {
      previousPathRef.current = pathname
      return
    }

    const existingIndex = stack.lastIndexOf(pathname)
    if (existingIndex >= 0) {
      // Back navigation: move to a previously visited page -> slide left.
      setTransitionDirection('left')
      stack = stack.slice(0, existingIndex + 1)
    } else {
      // Forward navigation: new page -> slide right.
      setTransitionDirection('right')
      stack.push(pathname)
    }

    try {
      window.sessionStorage.setItem(stackKeyRef.current, JSON.stringify(stack))
    } catch {
      // Ignore storage write errors.
    }

    previousPathRef.current = pathname
  }, [canAnimate, isAdminPath, isMobile, pathname])

  return (
    <>
      <AppVersionChecker />
      <SplashScreen waitForHomeReady={!isAdminPath && isHomePath} />
      <InstallBanner />
      {isAdminPath ? (
        children
      ) : (
        <CartProvider>
          <div
            key={pathname}
            className={
              canAnimate && isMobile
                ? `mobile-page-transition mobile-page-transition--${transitionDirection}`
                : 'mobile-page-transition'
            }
          >
            {children}
          </div>
          <footer className="border-t border-border/60 bg-background">
            <div className="container mx-auto max-w-7xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
              <span>Created by </span>
              {creatorSiteUrl ? (
                <Link
                  href={creatorSiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  DG Designer
                </Link>
              ) : (
                <span className="font-medium text-foreground">DG Designer</span>
              )}
            </div>
          </footer>
          <FloatingCartButton />
          <GlobalOrderTerminalDialog />
        </CartProvider>
      )}
      <Toaster />
    </>
  )
}
