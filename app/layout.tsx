import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { CartProvider } from '@/lib/cart-context'
import { Toaster } from '@/components/ui/sonner'
import { FloatingCartButton } from '@/components/floating-cart-button'
import { AppVersionChecker } from '@/components/app-version-checker'

import './globals.css'

const geist = Geist({ 
  subsets: ['latin'],
  variable: '--font-geist'
})
const geistMono = Geist_Mono({ 
  subsets: ['latin'],
  variable: '--font-geist-mono'
})

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Amico Fritto - Food Delivery',
  description: 'Ordina i migliori fritti della città',
  icons: {
    icon: '/icons/icon-star.svg',
  },
  openGraph: {
    title: 'Amico Fritto - Food Delivery',
    description: 'Ordina i migliori fritti della città',
    url: '/',
    type: 'website',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'Amico Fritto',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Amico Fritto - Food Delivery',
    description: 'Ordina i migliori fritti della città',
    images: ['/logo.png'],
  },
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
          <AppVersionChecker />
          {children}
          <FloatingCartButton />
          <Toaster />
        </CartProvider>
      </body>
    </html>
  )
}
