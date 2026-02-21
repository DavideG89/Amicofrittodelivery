'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage, deleteToken, type MessagePayload } from 'firebase/messaging'
import { supabase } from '@/lib/supabase'

declare global {
  // eslint-disable-next-line no-var
  var __adminPushSubscribers: Set<(payload: MessagePayload) => void> | undefined
  // eslint-disable-next-line no-var
  var __adminPushState:
    | { unsubscribe: null | (() => void); lastMessageId: string; lastMessageAt: number }
    | undefined
}

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
  let registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  }

  const ready = await navigator.serviceWorker.ready
  ready.active?.postMessage({ type: 'INIT_FIREBASE', config })
  return ready
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
  if (!registration || !registration.pushManager) {
    return { ok: false, reason: 'unsupported' }
  }
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
  try {
    localStorage.setItem('admin-push-token', token)
    localStorage.setItem('admin-push:active', 'true')
  } catch {
    // ignore storage errors
  }

  return { ok: true, token }
}

export async function disableAdminPush() {
  if (typeof window === 'undefined') return { ok: false }
  const supported = await isSupported().catch(() => false)
  if (!supported) return { ok: false }

  const token = localStorage.getItem('admin-push-token') || ''
  if (!token) {
    try {
      localStorage.setItem('admin-push:active', 'false')
    } catch {
      // ignore
    }
    return { ok: true }
  }

  const app = getFirebaseApp()
  const messaging = getMessaging(app)
  await deleteToken(messaging).catch(() => {})

  await supabase.from('admin_push_tokens').delete().eq('token', token)
  try {
    localStorage.removeItem('admin-push-token')
    localStorage.setItem('admin-push:active', 'false')
  } catch {
    // ignore
  }

  return { ok: true }
}

export async function listenForForegroundNotifications(
  onNotification: (payload: MessagePayload) => void
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return () => {}
  const supported = await isSupported().catch(() => false)
  if (!supported || !hasFirebaseConfig()) return () => {}

  const app = getFirebaseApp()
  const messaging = getMessaging(app)
  if (!globalThis.__adminPushSubscribers) {
    globalThis.__adminPushSubscribers = new Set()
  }
  if (!globalThis.__adminPushState) {
    globalThis.__adminPushState = {
      unsubscribe: null as null | (() => void),
      lastMessageId: '' as string,
      lastMessageAt: 0 as number,
    }
  }

  const subscribers: Set<(payload: MessagePayload) => void> = globalThis.__adminPushSubscribers
  const state: { unsubscribe: null | (() => void); lastMessageId: string; lastMessageAt: number } =
    globalThis.__adminPushState

  subscribers.add(onNotification)

  if (!state.unsubscribe) {
    state.unsubscribe = onMessage(messaging, (payload) => {
      const messageId =
        payload.messageId ||
        payload?.data?.messageId ||
        payload?.data?.id ||
        ''
      const now = Date.now()
      if (messageId && messageId === state.lastMessageId && now - state.lastMessageAt < 5000) {
        return
      }
      if (messageId) {
        state.lastMessageId = messageId
        state.lastMessageAt = now
      }
      subscribers.forEach((cb) => cb(payload))
    })
  }

  return () => {
    subscribers.delete(onNotification)
    if (subscribers.size === 0 && state.unsubscribe) {
      state.unsubscribe()
      state.unsubscribe = null
    }
  }
}
