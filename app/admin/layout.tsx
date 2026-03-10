import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'AF Dashboard',
  description: 'Dashboard amministratore Amico Fritto',
  manifest: '/admin/manifest.webmanifest',
  icons: {
    icon: [{ url: '/iconfritto.svg', type: 'image/svg+xml' }],
    shortcut: '/iconfritto.svg',
    apple: '/iconfritto.svg',
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
