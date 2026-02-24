-- Customer push tokens (used to notify order status updates)
CREATE TABLE IF NOT EXISTS customer_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  token TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (order_number, token)
);

CREATE INDEX IF NOT EXISTS idx_customer_push_tokens_order_number
  ON customer_push_tokens(order_number);

CREATE INDEX IF NOT EXISTS idx_customer_push_tokens_last_seen
  ON customer_push_tokens(last_seen DESC);
