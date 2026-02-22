'use client'

import { supabase } from '@/lib/supabase'

export async function loginAdmin(password: string) {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''
  if (!adminEmail) {
    return { ok: false, error: 'Email admin non configurata' }
  }
  if (!password) {
    return { ok: false, error: 'Password obbligatoria' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email: adminEmail, password })
  if (error) {
    return { ok: false, error: error.message || 'Accesso non riuscito' }
  }

  return { ok: true }
}

export async function logoutAdmin() {
  await supabase.auth.signOut()
}
