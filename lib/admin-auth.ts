'use client'

export async function loginAdmin(password: string) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data?.error || 'Accesso non riuscito' }
  }

  return { ok: true }
}

export async function logoutAdmin() {
  await fetch('/api/admin/logout', { method: 'POST' })
}
