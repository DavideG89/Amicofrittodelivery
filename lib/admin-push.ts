'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging'
import { supabase } from '@/lib/supabase'

type PushResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'missing_config' | 'no_token' | 'error' }

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      vapidKey
  )
}

function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
}

async function ensureServiceWorker(config: typeof firebaseConfig) {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const ready = await navigator.serviceWorker.ready
  ready.active?.postMessage({ type: 'INIT_FIREBASE', config })
  return registration
}

export async function enableAdminPush(): Promise<PushResult> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' }
  }

  const supported = await isSupported().catch(() => false)
  if (!supported) return { ok: false, reason: 'unsupported' }

  if (!hasFirebaseConfig()) return { ok: false, reason: 'missing_config' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  const app = getFirebaseApp()
  const registration = await ensureServiceWorker(firebaseConfig)
  const messaging = getMessaging(app)

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })

  if (!token) return { ok: false, reason: 'no_token' }

  const { error } = await supabase
    .from('admin_push_tokens')
    .upsert(
      {
        token,
        user_agent: navigator.userAgent,
        device_info: navigator.platform ?? null,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'token' }
    )

  if (error) return { ok: false, reason: 'error' }

  return { ok: true, token }
}

export async function listenForForegroundNotifications(
  onNotification: (payload: MessagePayload) => void
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return () => {}
  const supported = await isSupported().catch(() => false)
  if (!supported || !hasFirebaseConfig()) return () => {}

  const app = getFirebaseApp()
  const messaging = getMessaging(app)
  return onMessage(messaging, onNotification)
}
