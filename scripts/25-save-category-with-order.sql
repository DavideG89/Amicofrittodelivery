-- Salvataggio transazionale delle categorie con riordino atomico.
-- Dipende da scripts/20-create-admin-authorization.sql e scripts/24-enable-mini-burger-ingredients.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_category_with_order(
  p_category_id UUID,
  p_category JSONB,
  p_requested_display_order INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_category_id UUID;
  v_name TEXT;
  v_slug TEXT;
  v_ingredient_customization_enabled BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori'
      USING ERRCODE = '42501';
  END IF;

  IF p_category IS NULL OR jsonb_typeof(p_category) <> 'object'
    OR NOT (p_category ?& ARRAY['name', 'slug', 'ingredient_customization_enabled'])
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_category) AS category_key(key)
      WHERE category_key.key NOT IN ('name', 'slug', 'ingredient_customization_enabled')
    ) THEN
    RAISE EXCEPTION 'Payload categoria non valido'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_category -> 'name') <> 'string'
    OR char_length(btrim(p_category ->> 'name')) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_category -> 'slug') <> 'string'
    OR char_length(btrim(p_category ->> 'slug')) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_category -> 'ingredient_customization_enabled') <> 'boolean'
    OR p_requested_display_order IS NULL
    OR p_requested_display_order < 0 THEN
    RAISE EXCEPTION 'Dati categoria non validi'
      USING ERRCODE = '22023';
  END IF;

  v_name := btrim(p_category ->> 'name');
  v_slug := btrim(p_category ->> 'slug');
  v_ingredient_customization_enabled := (p_category ->> 'ingredient_customization_enabled')::BOOLEAN;

  -- Serializza anche due dashboard aperte contemporaneamente.
  LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;

  IF p_category_id IS NULL THEN
    INSERT INTO public.categories (name, slug, display_order, ingredient_customization_enabled)
    VALUES (v_name, v_slug, 0, v_ingredient_customization_enabled)
    RETURNING id INTO v_category_id;
  ELSE
    UPDATE public.categories
    SET
      name = v_name,
      slug = v_slug,
      ingredient_customization_enabled = v_ingredient_customization_enabled
    WHERE id = p_category_id
    RETURNING id INTO v_category_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Categoria non trovata'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  WITH remaining_categories AS (
    SELECT
      id,
      row_number() OVER (ORDER BY display_order, name, id) - 1 AS current_position
    FROM public.categories
    WHERE id <> v_category_id
  ), target_position AS (
    SELECT LEAST(p_requested_display_order, count(*)::INTEGER) AS value
    FROM remaining_categories
  ), next_orders AS (
    SELECT v_category_id AS id, target_position.value AS display_order
    FROM target_position

    UNION ALL

    SELECT
      remaining_categories.id,
      remaining_categories.current_position
        + CASE
            WHEN remaining_categories.current_position >= target_position.value THEN 1
            ELSE 0
          END AS display_order
    FROM remaining_categories
    CROSS JOIN target_position
  )
  UPDATE public.categories AS category
  SET display_order = next_orders.display_order
  FROM next_orders
  WHERE category.id = next_orders.id;

  RETURN v_category_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_category_with_order(UUID, JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_category_with_order(UUID, JSONB, INTEGER)
  TO authenticated;

COMMIT;
