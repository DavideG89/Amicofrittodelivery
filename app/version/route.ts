import { NextResponse } from 'next/server'

export const runtime = 'edge'

export function GET() {
  const version =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    String(Date.now())

  return NextResponse.json({ version }, { headers: { 'Cache-Control': 'no-store' } })
}
