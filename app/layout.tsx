import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { CartProvider } from '@/lib/cart-context'
import { Toaster } from '@/components/ui/sonner'
import { FloatingCartButton } from '@/components/floating-cart-button'

import './globals.css'

const geist = Geist({ 
  subsets: ['latin'],
  variable: '--font-geist'
})
const geistMono = Geist_Mono({ 
  subsets: ['latin'],
  variable: '--font-geist-mono'
})

export const metadata: Metadata = {
  title: 'Amico Fritto - Food Delivery',
  description: 'Ordina i migliori fritti della città',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`} suppressHydrationWarning>
        <CartProvider>
          {children}
          <FloatingCartButton />
          <Toaster />
        </CartProvider>
      </body>
    </html>
  )
}
