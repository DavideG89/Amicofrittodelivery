import type { Metadata } from 'next'
import { Oswald, Geist_Mono } from 'next/font/google'
import { RootProviders } from '@/components/root-providers'

import './globals.css'

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-oswald',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Amico Fritto - Food Delivery',
  description: 'Ordina i migliori fritti della città',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-star.svg',
    apple: '/icons/icon-star.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Amico Fritto',
    statusBarStyle: 'default',
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
      <body className={`${oswald.variable} ${geistMono.variable} font-sans antialiased overflow-x-hidden overscroll-x-none`} suppressHydrationWarning>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  )
}
