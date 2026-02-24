/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    let supabaseOrigin = ''
    try {
      if (supabaseUrl) supabaseOrigin = new URL(supabaseUrl).origin
    } catch {
      supabaseOrigin = ''
    }
    const supabaseWildcard = 'https://*.supabase.co'
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://unpkg.com blob:",
      "script-src-elem 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://unpkg.com blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://www.google.com https://www.gstatic.com",
      "font-src 'self' data: https://www.gstatic.com https://fonts.gstatic.com",
      `connect-src 'self' https://www.google.com https://www.gstatic.com https://www.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://www.google-analytics.com ${supabaseOrigin} ${supabaseWildcard} wss://*.supabase.co ${supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : ''}`,
      "frame-src https://www.google.com https://www.gstatic.com",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
        ],
      },
    ]
  },
}

export default nextConfig
