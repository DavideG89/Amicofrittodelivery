import 'server-only'
import { createSign } from 'crypto'

type AccessTokenConfig = {
  projectId: string
  clientEmail: string
  privateKey: string
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getAccessToken(config: AccessTokenConfig) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )

  const unsignedToken = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  const signature = base64Url(signer.sign(config.privateKey))
  const jwt = `${unsignedToken}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to get access token: ${text}`)
  }

  const data = await res.json()
  return String(data.access_token || '')
}

export type FcmMessage = {
  title: string
  body: string
  clickAction: string
  data?: Record<string, string>
}

export async function sendFcmMessages(tokens: string[], message: FcmMessage) {
  const projectId = process.env.FIREBASE_PROJECT_ID || ''
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || ''
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase env vars')
  }

  const accessToken = await getAccessToken({ projectId, clientEmail, privateKey })

  const results: { token: string; ok: boolean; status?: number; error?: string }[] = []

  for (const token of tokens) {
    const payload = {
      message: {
        token,
        notification: { title: message.title, body: message.body },
        data: {
          ...(message.data || {}),
          click_action: message.clickAction,
        },
        webpush: {
          fcm_options: {
            link: message.clickAction || undefined,
          },
          notification: {
            title: message.title,
            body: message.body,
            icon: '/icons/icon-192.png',
            data: { click_action: message.clickAction },
          },
        },
      },
    }

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (res.ok) {
      results.push({ token, ok: true })
    } else {
      const text = await res.text()
      results.push({ token, ok: false, status: res.status, error: text })
    }
  }

  return results
}
