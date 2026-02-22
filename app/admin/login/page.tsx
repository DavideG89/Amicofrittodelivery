'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginAdmin, requestAdminPasswordReset } from '@/lib/admin-auth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session) {
        router.replace('/admin/dashboard')
      }
    })
    return () => {
      mounted = false
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Simulate loading for better UX
    await new Promise(resolve => setTimeout(resolve, 300))

    const result = await loginAdmin(password)
    if (result.ok) {
      toast.success('Accesso effettuato con successo')
      router.push('/admin/dashboard')
    } else {
      toast.error(result.error || 'Password non corretta')
      setPassword('')
    }

    setLoading(false)
  }

  const handleResetPassword = async () => {
    if (resetLoading) return
    setResetLoading(true)
    try {
      const origin = window.location.origin
      const redirectTo = `${origin}/admin/reset-password`
      const result = await requestAdminPasswordReset(redirectTo)
      if (result.ok) {
        toast.success('Link di reset inviato via email')
      } else {
        toast.error(result.error || 'Impossibile inviare il link')
      }
    } catch {
      toast.error('Impossibile inviare il link')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image 
              src="/logo.png" 
              alt="Amico Fritto" 
              width={160} 
              height={60}
              className="h-12 w-auto"
              priority
            />
          </div>
          <CardTitle className="text-2xl">Area Amministrativa</CardTitle>
          <CardDescription>Inserisci la password per accedere</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Inserisci la password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoFocus
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                'Accedi'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleResetPassword}
              disabled={resetLoading}
            >
              {resetLoading ? 'Invio link...' : 'Hai dimenticato la password?'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
