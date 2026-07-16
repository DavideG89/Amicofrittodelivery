import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase-server'

type AdminAuthorizationFailure = {
  ok: false
  status: 401 | 403 | 500
  error: string
}

type AdminAuthorizationSuccess = {
  ok: true
  supabase: ReturnType<typeof getSupabaseServerClient>
  userId: string
}

export type AdminAuthorizationResult =
  | AdminAuthorizationFailure
  | AdminAuthorizationSuccess

function readBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return ''
  return authorization.slice(7).trim()
}

export async function requireAdmin(request: Request): Promise<AdminAuthorizationResult> {
  const token = readBearerToken(request)
  if (!token) {
    return { ok: false, status: 401, error: 'Non autorizzato' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, status: 500, error: 'Configurazione Supabase mancante' }
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)

  if (authError || !authData.user) {
    return { ok: false, status: 401, error: 'Non autorizzato' }
  }

  const supabase = getSupabaseServerClient()
  const { data: adminUser, error: adminError } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (adminError) {
    console.error('[admin-auth] Unable to verify admin membership', {
      code: adminError.code,
    })
    return { ok: false, status: 500, error: 'Verifica amministratore non disponibile' }
  }

  if (!adminUser) {
    return { ok: false, status: 403, error: 'Non autorizzato' }
  }

  return { ok: true, supabase, userId: authData.user.id }
}
