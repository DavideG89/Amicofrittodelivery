-- Add customer-facing order tracking token.
--
-- Purpose:
-- - New public order links must require order_number + public_token.
-- - Existing orders remain readable only while public_token is NULL, for short rollout compatibility.
--
-- Rollback:
-- - Revert application code first.
-- - Then drop idx_orders_public_lookup and orders.public_token if no tokenized links are in use.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS public_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_unique
  ON public.orders(public_token)
  WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_public_lookup
  ON public.orders(order_number, public_token);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_public_token_format'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_public_token_format
      CHECK (
        public_token IS NULL
        OR (
          length(public_token) BETWEEN 32 AND 128
          AND public_token ~ '^[A-Za-z0-9_-]+$'
        )
      );
  END IF;
END $$;
