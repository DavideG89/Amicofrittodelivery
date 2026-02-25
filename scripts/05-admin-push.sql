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

-- Notify admin on new order via Supabase Edge Function
-- Uses pg_net extension for HTTP calls.
-- IMPORTANT:
-- 1) Replace YOUR_PROJECT_REF
-- 2) Replace REPLACE_WITH_SECRET with your WEBHOOK_SECRET value
-- 3) Keep this secret out of git in real deployments
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION notify_admin_on_new_order()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  payload := jsonb_build_object(
    'order_id', NEW.id,
    'order_number', NEW.order_number,
    'order_type', NEW.order_type,
    'total', NEW.total,
    'created_at', NEW.created_at
  );

  PERFORM net.http_post(
    url := 'https://YOUR_PROJECT_REF.functions.supabase.co/notify-new-order',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', 'REPLACE_WITH_SECRET'
    ),
    body := payload
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_admin_new_order ON orders;
CREATE TRIGGER trg_notify_admin_new_order
AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION notify_admin_on_new_order();
