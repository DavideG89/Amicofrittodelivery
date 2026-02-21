import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AF Dashboard',
  description: 'Dashboard amministratore Amico Fritto',
  manifest: '/admin/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-star.svg',
    apple: '/icons/icon-star.svg',
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
