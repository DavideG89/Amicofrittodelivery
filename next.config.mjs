/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
    const supabaseWildcard = 'https://*.supabase.co'
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com blob:",
      "script-src-elem 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://www.google.com https://www.gstatic.com",
      "font-src 'self' data: https://www.gstatic.com",
      `connect-src 'self' https://www.google.com https://www.gstatic.com ${supabaseOrigin} ${supabaseWildcard}`,
      "frame-src https://www.google.com https://www.gstatic.com",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
        ],
      },
    ]
  },
}

export default nextConfig
