-- Insert default categories
INSERT INTO categories (name, slug, display_order) VALUES
  ('Panini', 'panini', 1),
  ('Hamburgers', 'hamburgers', 2),
  ('Fritti', 'fritti', 3),
  ('Salse', 'salse', 4),
  ('Bevande', 'bevande', 5)
ON CONFLICT (slug) DO NOTHING;

-- Insert store info
INSERT INTO store_info (name, address, phone, opening_hours, delivery_fee, min_order_delivery)
VALUES (
  'Amico Fritto',
  'Via Roma 123, Milano',
  '+39 02 1234567',
  '{
    "lunedi": "Chiuso",
    "martedi": "18:00 - 23:00",
    "mercoledi": "18:00 - 23:00",
    "giovedi": "18:00 - 23:00",
    "venerdi": "18:00 - 00:00",
    "sabato": "18:00 - 00:00",
    "domenica": "18:00 - 23:00"
  }'::jsonb,
  3.00,
  15.00
)
ON CONFLICT DO NOTHING;

-- Insert some sample products
DO $$
DECLARE
  cat_panini UUID;
  cat_hamburgers UUID;
  cat_fritti UUID;
  cat_salse UUID;
  cat_bevande UUID;
BEGIN
  -- Get category IDs
  SELECT id INTO cat_panini FROM categories WHERE slug = 'panini';
  SELECT id INTO cat_hamburgers FROM categories WHERE slug = 'hamburgers';
  SELECT id INTO cat_fritti FROM categories WHERE slug = 'fritti';
  SELECT id INTO cat_salse FROM categories WHERE slug = 'salse';
  SELECT id INTO cat_bevande FROM categories WHERE slug = 'bevande';

  -- Insert Panini
  INSERT INTO products (category_id, name, description, price, image_url, ingredients, allergens, display_order)
  VALUES
    (cat_panini, 'Panino Classico', 'Il nostro panino tradizionale con ingredienti freschi', 5.50, '/placeholders/panini.jpg', 'Pane, prosciutto cotto, formaggio, lattuga, pomodoro', 'Glutine, Lattosio', 1),
    (cat_panini, 'Panino Vegetariano', 'Panino con verdure grigliate e mozzarella', 6.00, '/placeholders/panini.jpg', 'Pane, melanzane, zucchine, peperoni, mozzarella', 'Glutine, Lattosio', 2);

  -- Insert Hamburgers
  INSERT INTO products (category_id, name, description, price, image_url, ingredients, allergens, display_order)
  VALUES
    (cat_hamburgers, 'Bonny Burger', 'Hamburger con bacon, formaggio e croccanti fritti', 9.50, '/burgers/bonny-burger.png', 'Pane, carne di manzo 200g, bacon, formaggio, fritti croccanti, salsa speciale', 'Glutine, Lattosio', 1),
    (cat_hamburgers, 'Amico Burger', 'Il nostro burger signature con formaggio fuso', 9.00, '/burgers/amico-burger.png', 'Pane, carne di manzo 200g, doppio cheddar fuso, bacon, salsa BBQ', 'Glutine, Lattosio', 2),
    (cat_hamburgers, 'Chicken Burger', 'Burger di pollo croccante con salsa speciale', 8.50, '/burgers/chicken-burger.png', 'Pane, petto di pollo panato, bacon, formaggio, salsa al formaggio', 'Glutine, Uova, Lattosio', 3),
    (cat_hamburgers, 'Double Smash', 'Doppio hamburger smash con formaggio', 11.00, '/burgers/double-smash.png', 'Pane, doppia carne smashed 200g, doppio formaggio, cipolla caramellata, salsa burger', 'Glutine, Lattosio', 4);

  -- Insert Fritti
  INSERT INTO products (category_id, name, description, price, image_url, ingredients, allergens, display_order)
  VALUES
    (cat_fritti, 'Patatine Fritte', 'Porzione abbondante di patatine croccanti', 3.50, '/placeholders/fritti.jpg', 'Patate, olio di semi, sale', '', 1),
    (cat_fritti, 'Anelli di Cipolla', 'Cipolle impanate e fritte', 4.00, '/placeholders/fritti.jpg', 'Cipolle, panatura, olio di semi', 'Glutine', 2),
    (cat_fritti, 'Crocchette di Patate', '6 crocchette dorate', 4.50, '/placeholders/fritti.jpg', 'Patate, pangrattato, prezzemolo', 'Glutine', 3),
    (cat_fritti, 'Mozzarella in Carrozza', 'Mozzarella fritta in carrozza', 5.00, '/placeholders/fritti.jpg', 'Mozzarella, pane, uova, pangrattato', 'Glutine, Lattosio, Uova', 4),
    (cat_fritti, 'Olive Ascolane', '8 olive ripiene fritte', 5.50, '/placeholders/fritti.jpg', 'Olive, carne, panatura', 'Glutine', 5);

  -- Insert Salse
  INSERT INTO products (category_id, name, description, price, ingredients, allergens, display_order)
  VALUES
    (cat_salse, 'Ketchup', 'Salsa ketchup classica', 0.50, 'Pomodoro, zucchero, aceto', '', 1),
    (cat_salse, 'Maionese', 'Maionese artigianale', 0.50, 'Uova, olio, limone', 'Uova', 2),
    (cat_salse, 'Salsa BBQ', 'Salsa barbecue affumicata', 0.80, 'Pomodoro, spezie, affumicato', '', 3),
    (cat_salse, 'Salsa Piccante', 'Per chi ama il piccante', 0.80, 'Peperoncino, pomodoro, aglio', '', 4),
    (cat_salse, 'Salsa Aioli', 'Maionese all''aglio', 1.00, 'Maionese, aglio, limone', 'Uova', 5);

  -- Insert Bevande
  INSERT INTO products (category_id, name, description, price, image_url, ingredients, allergens, display_order)
  VALUES
    (cat_bevande, 'Coca Cola 33cl', 'Lattina Coca Cola', 2.50, '/placeholders/bevande.jpg', '', '', 1),
    (cat_bevande, 'Coca Cola Zero 33cl', 'Lattina Coca Cola Zero', 2.50, '/placeholders/bevande.jpg', '', '', 2),
    (cat_bevande, 'Fanta 33cl', 'Lattina Fanta', 2.50, '/placeholders/bevande.jpg', '', '', 3),
    (cat_bevande, 'Sprite 33cl', 'Lattina Sprite', 2.50, '/placeholders/bevande.jpg', '', '', 4),
    (cat_bevande, 'Acqua Naturale 50cl', 'Bottiglia acqua naturale', 1.50, '/placeholders/bevande.jpg', '', '', 5),
    (cat_bevande, 'Acqua Frizzante 50cl', 'Bottiglia acqua frizzante', 1.50, '/placeholders/bevande.jpg', '', '', 6),
    (cat_bevande, 'Birra Moretti 33cl', 'Bottiglia Birra Moretti', 3.50, '/placeholders/bevande.jpg', '', '', 7);

END $$;

-- Insert some sample discount codes
INSERT INTO discount_codes (code, discount_type, discount_value, min_order_amount, active)
VALUES
  ('BENVENUTO10', 'percentage', 10, 20, true),
  ('SCONTO5', 'fixed', 5, 15, true)
ON CONFLICT (code) DO NOTHING;
