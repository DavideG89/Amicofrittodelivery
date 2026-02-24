-- Add configurable order additions (sauces/extras) used in product "Aggiunte" modal

CREATE TABLE IF NOT EXISTS order_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('sauce', 'extra')),
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  UNIQUE(type, name),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_additions_type_active ON order_additions(type, active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_order_additions_updated_at'
  ) THEN
    CREATE TRIGGER update_order_additions_updated_at
    BEFORE UPDATE ON order_additions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO order_additions (type, name, price, active, display_order)
VALUES
  ('sauce', 'Ketchup', 0.00, true, 1),
  ('sauce', 'Maionese', 0.00, true, 2),
  ('sauce', 'Salsa BBQ', 0.00, true, 3),
  ('sauce', 'Salsa Piccante', 0.00, true, 4),
  ('sauce', 'Salsa Aioli', 0.00, true, 5),
  ('extra', 'Cheddar', 0.50, true, 1),
  ('extra', 'Cipolla cruda', 0.50, true, 2),
  ('extra', 'Cipolla in agrodolce', 0.50, true, 3),
  ('extra', 'Emmental', 0.50, true, 4),
  ('extra', 'Lattuga', 0.50, true, 5),
  ('extra', 'Patatine fritte', 0.50, true, 6),
  ('extra', 'Pomodoro', 0.50, true, 7),
  ('extra', 'Salame piccante', 0.50, true, 8),
  ('extra', 'Wurstel', 0.50, true, 9)
ON CONFLICT (type, name) DO NOTHING;
