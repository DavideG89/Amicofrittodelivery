import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'AF Dashboard',
  description: 'Dashboard amministratore Amico Fritto',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  manifest: '/admin/manifest.webmanifest',
  icons: {
    icon: [{ url: '/iconfritto.svg', type: 'image/svg+xml' }],
    shortcut: '/iconfritto.svg',
    apple: [{ url: '/180log.svg', sizes: '180x180', type: 'image/svg+xml' }],
  },
  appleWebApp: {
    capable: true,
    title: 'AF Dashboard',
    statusBarStyle: 'default',
  },
}

export default function AdminRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
