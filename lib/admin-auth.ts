'use client'

import { supabase } from '@/lib/supabase'

async function isAuthorizedAdmin(accessToken: string) {
  if (!accessToken) return false

  const response = await fetch('/api/admin/session', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  }).catch(() => null)

  return response?.ok === true
}

export async function loginAdmin(password: string) {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''
  if (!adminEmail) {
    return { ok: false, error: 'Email admin non configurata' }
  }
  if (!password) {
    return { ok: false, error: 'Password obbligatoria' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: adminEmail, password })
  if (error) {
    return { ok: false, error: error.message || 'Accesso non riuscito' }
  }

  const authorized = await isAuthorizedAdmin(data.session?.access_token || '')
  if (!authorized) {
    await supabase.auth.signOut({ scope: 'local' })
    return { ok: false, error: 'Account non autorizzato' }
  }

  return { ok: true }
}

export async function verifyAdminAccess(accessToken?: string) {
  if (accessToken) return isAuthorizedAdmin(accessToken)

  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return false
  return isAuthorizedAdmin(data.session.access_token)
}

export async function requestAdminPasswordReset(redirectTo: string) {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''
  if (!adminEmail) {
    return { ok: false, error: 'Email admin non configurata' }
  }
  const { error } = await supabase.auth.resetPasswordForEmail(adminEmail, { redirectTo })
  if (error) {
    return { ok: false, error: error.message || 'Impossibile inviare il link' }
  }
  return { ok: true }
}

export async function logoutAdmin() {
  await supabase.auth.signOut()
}
