import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AF Dashboard',
  description: 'Dashboard amministratore Amico Fritto',
  manifest: '/admin/manifest.webmanifest',
}

export default function AdminRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
