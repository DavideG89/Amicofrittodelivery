'use client'

export function checkAdminAuth(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('admin-authenticated') === 'true'
}

export function setAdminAuth(authenticated: boolean) {
  if (typeof window === 'undefined') return
  if (authenticated) {
    localStorage.setItem('admin-authenticated', 'true')
  } else {
    localStorage.removeItem('admin-authenticated')
  }
}

export function verifyAdminPassword(password: string): boolean {
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123'
  return password === adminPassword
}
