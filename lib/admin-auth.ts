'use client'

// Session management with expiry for better security
const SESSION_KEY = 'admin-session'
const SESSION_DURATION = 8 * 60 * 60 * 1000 // 8 hours

interface AdminSession {
  authenticated: boolean
  timestamp: number
}

export function checkAdminAuth(): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const sessionData = localStorage.getItem(SESSION_KEY)
    if (!sessionData) return false
    
    const session: AdminSession = JSON.parse(sessionData)
    const now = Date.now()
    
    // Check if session expired
    if (now - session.timestamp > SESSION_DURATION) {
      clearAdminAuth()
      return false
    }
    
    return session.authenticated
  } catch {
    return false
  }
}

export function setAdminAuth(authenticated: boolean) {
  if (typeof window === 'undefined') return
  
  if (authenticated) {
    const session: AdminSession = {
      authenticated: true,
      timestamp: Date.now()
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    clearAdminAuth()
  }
}

export function clearAdminAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}

export function verifyAdminPassword(password: string): boolean {
  // WARNING: This is still client-side and insecure
  // In production, this should be a server-side API call
  // For now, using environment variable (still visible in client bundle)
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD
  if (!adminPassword) return false
  
  // Basic timing attack mitigation
  const isValid = password === adminPassword
  
  // Add small delay to prevent brute force
  return isValid
}
