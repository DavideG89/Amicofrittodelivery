-- Order completion feedback collected from the customer terminal drawer.
CREATE TABLE IF NOT EXISTS order_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_feedback_created ON order_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_feedback_rating ON order_feedback(rating);

ALTER TABLE order_feedback ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_order_feedback_updated_at ON order_feedback;
CREATE TRIGGER update_order_feedback_updated_at BEFORE UPDATE ON order_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
