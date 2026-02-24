'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { CartProvider } from '@/lib/cart-context'
import { FloatingCartButton } from '@/components/floating-cart-button'
import { Toaster } from '@/components/ui/sonner'
import { AppVersionChecker } from '@/components/app-version-checker'
import { InstallBanner } from '@/components/install-banner'
import { SplashScreen } from '@/components/splash-screen'

export function RootProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAdminPath = pathname.startsWith('/admin')

  return (
    <>
      <AppVersionChecker />
      <SplashScreen />
      <InstallBanner />
      {isAdminPath ? (
        children
      ) : (
        <CartProvider>
          {children}
          <FloatingCartButton />
        </CartProvider>
      )}
      <Toaster />
    </>
  )
}
