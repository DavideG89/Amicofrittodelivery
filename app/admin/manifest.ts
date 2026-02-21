import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AF Dashboard',
    short_name: 'AF Dashboard',
    description: 'Dashboard amministratore Amico Fritto',
    start_url: '/admin/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/icons/icon-star.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
