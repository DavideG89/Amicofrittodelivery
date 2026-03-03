-- Print queue for robust/automatic kitchen printing.
CREATE TABLE IF NOT EXISTS print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  trigger_status TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'printed', 'error', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  claimed_by TEXT,
  printed_at TIMESTAMP WITH TIME ZONE,
  printer_target TEXT,
  dedupe_key TEXT UNIQUE,
  last_error TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_status_retry
  ON print_jobs(status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id
  ON print_jobs(order_id);

CREATE INDEX IF NOT EXISTS idx_print_jobs_order_number
  ON print_jobs(order_number);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_print_jobs_updated_at'
    ) THEN
      EXECUTE 'CREATE TRIGGER update_print_jobs_updated_at BEFORE UPDATE ON print_jobs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
  END IF;
END $$;

-- Locked down: managed only by server/service-role APIs.
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE print_jobs FROM anon, authenticated;
