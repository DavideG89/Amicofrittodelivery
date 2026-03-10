import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AF Delivery',
    short_name: 'AF Delivery',
    description: 'Ordina i migliori fritti della città',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/iconfritto.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
