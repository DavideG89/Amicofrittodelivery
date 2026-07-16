-- Admin push tokens (used by the web dashboard)
CREATE TABLE IF NOT EXISTS admin_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  device_info TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_push_tokens_last_seen ON admin_push_tokens(last_seen DESC);

-- Admin notifications are sent by app/api/orders/route.ts.
-- Do not add a second database webhook here: it would duplicate notifications
-- and would require storing deployment-specific URLs or secrets in a migration.
