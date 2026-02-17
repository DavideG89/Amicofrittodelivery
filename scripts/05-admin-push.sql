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
-- IMPORTANT: Replace YOUR_PROJECT_REF and REPLACE_WITH_SECRET before running.
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

  PERFORM supabase_functions.http_request(
    'https://sghftuvrupaswqhdckvs.functions.supabase.co/notify-new-order',
    'POST',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', 'AF_NOTIFY_2026_Xy9!'
    ),
    payload
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_admin_new_order ON orders;
CREATE TRIGGER trg_notify_admin_new_order
AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION notify_admin_on_new_order();
