import type { MetadataRoute } from 'next'

const siteUrl = 'https://amicofritto.store'
const now = new Date()

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/info`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/cart`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },

  ]
}
