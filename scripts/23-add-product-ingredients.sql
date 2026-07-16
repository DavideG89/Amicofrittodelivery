-- Product-specific removable ingredients for order customization.
-- Prerequisites: migrations 20 and 21 (admin_users and public.is_admin()).
-- Impact: additive schema change; existing products and orders remain compatible.
-- Rollback: revert application code first, then drop this table only after no
-- retained order or admin workflow depends on ingredient configuration.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'Required table public.products is missing';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Required function public.is_admin() is missing; apply migrations 20 and 21 first';
  END IF;
END $$;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS ingredient_customization_enabled BOOLEAN NOT NULL DEFAULT false;

-- Enable only the currently agreed category families. Matching is exact after
-- case/whitespace normalization and does not rename or otherwise mutate slugs.
UPDATE public.categories
SET ingredient_customization_enabled = true
WHERE lower(btrim(slug)) IN (
    'hamburger',
    'hamburgers',
    'kebab',
    'mini',
    'mini-hamburger',
    'mini-hamburgers',
    'panini',
    'panino'
  )
  OR regexp_replace(lower(btrim(name)), '\s+', ' ', 'g') IN (
    'hamburger',
    'hamburgers',
    'kebab',
    'mini',
    'mini hamburger',
    'mini hamburgers',
    'panini',
    'panino'
  );

CREATE TABLE IF NOT EXISTS public.product_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  removable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_ingredients_product_active
  ON public.product_ingredients(product_id, active, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS product_ingredients_product_normalized_name_key
  ON public.product_ingredients(product_id, lower(btrim(name)));

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_product_ingredients_updated_at'
        AND tgrelid = 'public.product_ingredients'::regclass
    ) THEN
    CREATE TRIGGER update_product_ingredients_updated_at
    BEFORE UPDATE ON public.product_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_ingredients FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.product_ingredients TO anon, authenticated;

DROP POLICY IF EXISTS product_ingredients_public_read ON public.product_ingredients;
CREATE POLICY product_ingredients_public_read
ON public.product_ingredients
FOR SELECT TO anon, authenticated
USING (active = true);

DROP POLICY IF EXISTS product_ingredients_admin_manage ON public.product_ingredients;
CREATE POLICY product_ingredients_admin_manage
ON public.product_ingredients
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.replace_product_ingredients(
  p_product_id UUID,
  p_ingredients JSONB
)
RETURNS SETOF public.product_ingredients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customization_enabled BOOLEAN;
  v_item_count INTEGER;
  v_unique_name_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori'
      USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'ID prodotto mancante'
      USING ERRCODE = '22023';
  END IF;

  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'Gli ingredienti devono essere un array JSON'
      USING ERRCODE = '22023';
  END IF;

  v_item_count := jsonb_array_length(p_ingredients);
  IF v_item_count > 20 THEN
    RAISE EXCEPTION 'Sono consentiti al massimo 20 ingredienti per prodotto'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_ingredients) AS entry(value)
    WHERE jsonb_typeof(entry.value) <> 'object'
      OR NOT (entry.value ? 'name')
      OR jsonb_typeof(entry.value -> 'name') <> 'string'
      OR char_length(btrim(entry.value ->> 'name')) NOT BETWEEN 1 AND 120
      OR (
        entry.value ? 'removable'
        AND jsonb_typeof(entry.value -> 'removable') <> 'boolean'
      )
      OR (
        entry.value ? 'active'
        AND jsonb_typeof(entry.value -> 'active') <> 'boolean'
      )
  ) THEN
    RAISE EXCEPTION 'Ogni ingrediente richiede un nome da 1 a 120 caratteri e flag booleani validi'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT lower(btrim(entry.value ->> 'name')))
  INTO v_unique_name_count
  FROM jsonb_array_elements(p_ingredients) AS entry(value);

  IF v_unique_name_count <> v_item_count THEN
    RAISE EXCEPTION 'I nomi ingrediente devono essere univoci ignorando maiuscole e spazi esterni'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the product row so concurrent replacements for the same product are serialized.
  SELECT category.ingredient_customization_enabled
  INTO v_customization_enabled
  FROM public.products AS product
  JOIN public.categories AS category ON category.id = product.category_id
  WHERE product.id = p_product_id
  FOR UPDATE OF product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prodotto o categoria non trovati'
      USING ERRCODE = '23503';
  END IF;

  IF v_customization_enabled IS NOT TRUE THEN
    IF v_item_count > 0 THEN
      RAISE EXCEPTION 'Personalizzazione ingredienti non abilitata per la categoria del prodotto'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Update by normalized name first so stable ingredient IDs remain unchanged.
  UPDATE public.product_ingredients AS ingredient
  SET
    name = incoming.name,
    removable = incoming.removable,
    active = incoming.active,
    display_order = incoming.display_order
  FROM (
    SELECT
      btrim(entry.value ->> 'name') AS name,
      CASE
        WHEN entry.value ? 'removable' THEN (entry.value ->> 'removable')::BOOLEAN
        ELSE true
      END AS removable,
      CASE
        WHEN entry.value ? 'active' THEN (entry.value ->> 'active')::BOOLEAN
        ELSE true
      END AS active,
      (entry.ordinality - 1)::INTEGER AS display_order
    FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY AS entry(value, ordinality)
  ) AS incoming
  WHERE ingredient.product_id = p_product_id
    AND lower(btrim(ingredient.name)) = lower(btrim(incoming.name));

  INSERT INTO public.product_ingredients (
    product_id,
    name,
    removable,
    active,
    display_order
  )
  SELECT
    p_product_id,
    incoming.name,
    incoming.removable,
    incoming.active,
    incoming.display_order
  FROM (
    SELECT
      btrim(entry.value ->> 'name') AS name,
      CASE
        WHEN entry.value ? 'removable' THEN (entry.value ->> 'removable')::BOOLEAN
        ELSE true
      END AS removable,
      CASE
        WHEN entry.value ? 'active' THEN (entry.value ->> 'active')::BOOLEAN
        ELSE true
      END AS active,
      (entry.ordinality - 1)::INTEGER AS display_order
    FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY AS entry(value, ordinality)
  ) AS incoming
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_ingredients AS existing
    WHERE existing.product_id = p_product_id
      AND lower(btrim(existing.name)) = lower(btrim(incoming.name))
  );

  -- Archive absent rows instead of deleting them so a later re-add can reuse the ID.
  UPDATE public.product_ingredients AS ingredient
  SET active = false
  WHERE ingredient.product_id = p_product_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_ingredients) AS entry(value)
      WHERE lower(btrim(entry.value ->> 'name')) = lower(btrim(ingredient.name))
    );

  RETURN QUERY
  SELECT ingredient.*
  FROM public.product_ingredients AS ingredient
  WHERE ingredient.product_id = p_product_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_ingredients) AS entry(value)
      WHERE lower(btrim(entry.value ->> 'name')) = lower(btrim(ingredient.name))
    )
  ORDER BY ingredient.display_order, ingredient.name;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_ingredients(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_ingredients(UUID, JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_product_with_ingredients(
  p_product_id UUID,
  p_product JSONB,
  p_product_ingredients JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product_id UUID;
  v_category_id UUID;
  v_name TEXT;
  v_description TEXT;
  v_price NUMERIC(10, 2);
  v_image_url TEXT;
  v_ingredients_text TEXT;
  v_allergens TEXT;
  v_piece_options JSONB;
  v_available BOOLEAN;
  v_label TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori'
      USING ERRCODE = '42501';
  END IF;

  IF p_product IS NULL OR jsonb_typeof(p_product) <> 'object' THEN
    RAISE EXCEPTION 'Il prodotto deve essere un oggetto JSON'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_product ?& ARRAY[
    'category_id',
    'name',
    'description',
    'price',
    'image_url',
    'ingredients',
    'allergens',
    'piece_options',
    'available',
    'label'
  ]) THEN
    RAISE EXCEPTION 'Payload prodotto incompleto'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_product) AS product_key(key)
    WHERE product_key.key NOT IN (
      'category_id',
      'name',
      'description',
      'price',
      'image_url',
      'ingredients',
      'allergens',
      'piece_options',
      'available',
      'label'
    )
  ) THEN
    RAISE EXCEPTION 'Il payload prodotto contiene campi non consentiti'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'category_id') <> 'string'
    OR (p_product ->> 'category_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Categoria non valida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'name') <> 'string'
    OR char_length(btrim(p_product ->> 'name')) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Nome prodotto non valido'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'price') <> 'number'
    OR (p_product ->> 'price')::NUMERIC < 0
    OR (p_product ->> 'price')::NUMERIC > 99999999.99 THEN
    RAISE EXCEPTION 'Prezzo prodotto non valido'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'available') <> 'boolean' THEN
    RAISE EXCEPTION 'Disponibilità prodotto non valida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'description') NOT IN ('string', 'null')
    OR (
      jsonb_typeof(p_product -> 'description') = 'string'
      AND char_length(p_product ->> 'description') > 4000
    ) THEN
    RAISE EXCEPTION 'Descrizione prodotto non valida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'image_url') NOT IN ('string', 'null')
    OR (
      jsonb_typeof(p_product -> 'image_url') = 'string'
      AND char_length(p_product ->> 'image_url') > 5000000
    ) THEN
    RAISE EXCEPTION 'Immagine prodotto non valida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'ingredients') NOT IN ('string', 'null')
    OR (
      jsonb_typeof(p_product -> 'ingredients') = 'string'
      AND char_length(p_product ->> 'ingredients') > 4000
    ) THEN
    RAISE EXCEPTION 'Testo ingredienti non valido'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'allergens') NOT IN ('string', 'null')
    OR (
      jsonb_typeof(p_product -> 'allergens') = 'string'
      AND char_length(p_product ->> 'allergens') > 2000
    ) THEN
    RAISE EXCEPTION 'Allergeni non validi'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'piece_options') NOT IN ('array', 'null')
    OR (
      jsonb_typeof(p_product -> 'piece_options') = 'array'
      AND (
        jsonb_array_length(p_product -> 'piece_options') > 50
        OR octet_length((p_product -> 'piece_options')::TEXT) > 20000
      )
    ) THEN
    RAISE EXCEPTION 'Opzioni quantità non valide'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_product -> 'label') NOT IN ('string', 'null')
    OR (
      jsonb_typeof(p_product -> 'label') = 'string'
      AND (p_product ->> 'label') NOT IN ('sconto', 'novita')
    ) THEN
    RAISE EXCEPTION 'Etichetta prodotto non valida'
      USING ERRCODE = '22023';
  END IF;

  IF p_product_ingredients IS NULL OR jsonb_typeof(p_product_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'Gli ingredienti configurabili devono essere un array JSON'
      USING ERRCODE = '22023';
  END IF;

  v_category_id := (p_product ->> 'category_id')::UUID;
  IF NOT EXISTS (
    SELECT 1
    FROM public.categories AS category
    WHERE category.id = v_category_id
  ) THEN
    RAISE EXCEPTION 'Categoria non trovata'
      USING ERRCODE = '23503';
  END IF;

  v_name := btrim(p_product ->> 'name');
  v_description := CASE
    WHEN jsonb_typeof(p_product -> 'description') = 'null' THEN NULL
    ELSE p_product ->> 'description'
  END;
  v_price := round((p_product ->> 'price')::NUMERIC, 2);
  v_image_url := CASE
    WHEN jsonb_typeof(p_product -> 'image_url') = 'null' THEN NULL
    ELSE p_product ->> 'image_url'
  END;
  v_ingredients_text := CASE
    WHEN jsonb_typeof(p_product -> 'ingredients') = 'null' THEN NULL
    ELSE p_product ->> 'ingredients'
  END;
  v_allergens := CASE
    WHEN jsonb_typeof(p_product -> 'allergens') = 'null' THEN NULL
    ELSE p_product ->> 'allergens'
  END;
  v_piece_options := CASE
    WHEN jsonb_typeof(p_product -> 'piece_options') = 'null' THEN NULL
    ELSE p_product -> 'piece_options'
  END;
  v_available := (p_product ->> 'available')::BOOLEAN;
  v_label := CASE
    WHEN jsonb_typeof(p_product -> 'label') = 'null' THEN NULL
    ELSE p_product ->> 'label'
  END;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      category_id,
      name,
      description,
      price,
      image_url,
      ingredients,
      allergens,
      piece_options,
      available,
      label
    )
    VALUES (
      v_category_id,
      v_name,
      v_description,
      v_price,
      v_image_url,
      v_ingredients_text,
      v_allergens,
      v_piece_options,
      v_available,
      v_label
    )
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.products
    SET
      category_id = v_category_id,
      name = v_name,
      description = v_description,
      price = v_price,
      image_url = v_image_url,
      ingredients = v_ingredients_text,
      allergens = v_allergens,
      piece_options = v_piece_options,
      available = v_available,
      label = v_label
    WHERE id = p_product_id
    RETURNING id INTO v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Prodotto non trovato'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.replace_product_ingredients(v_product_id, p_product_ingredients);

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_product_with_ingredients(UUID, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_with_ingredients(UUID, JSONB, JSONB)
  TO authenticated;

COMMIT;
