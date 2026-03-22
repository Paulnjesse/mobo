-- Migration 017: Ads management table
-- Stores all ad banners shown in the mobile app, managed from admin dashboard.

CREATE TABLE IF NOT EXISTS ads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           VARCHAR(20)  NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'business')),
  title          VARCHAR(120) NOT NULL,
  subtitle       VARCHAR(200) NOT NULL,
  cta            VARCHAR(40)  NOT NULL DEFAULT 'Learn More',
  icon           VARCHAR(60)  NOT NULL DEFAULT 'megaphone-outline',   -- Ionicons name
  color          VARCHAR(20)  NOT NULL DEFAULT '#FF00BF',              -- hex color
  sponsor        VARCHAR(100),                                         -- business name (NULL for internal)
  url            VARCHAR(300),                                         -- tap-through URL (NULL for internal)
  image_url      VARCHAR(300),                                         -- optional banner image URL
  context        VARCHAR(20)  NOT NULL DEFAULT 'home' CHECK (context IN ('home', 'ride', 'auth', 'all')),
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  priority       SMALLINT     NOT NULL DEFAULT 0,                      -- higher = shown first
  impressions    INTEGER      NOT NULL DEFAULT 0,
  clicks         INTEGER      NOT NULL DEFAULT 0,
  start_date     DATE,
  end_date       DATE,
  created_by     UUID,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_context_active ON ads (context, active);
CREATE INDEX IF NOT EXISTS idx_ads_type ON ads (type);

-- Seed default internal ads (mirrors AdBanner hardcoded fallback)
INSERT INTO ads (type, title, subtitle, cta, icon, color, context, priority) VALUES
  ('internal', 'Ride 5x, Save 20%',        'Complete 5 trips this week — get 20% off your next ride.',  'Activate',   'flash-outline',    '#FF6B00', 'all',  10),
  ('internal', 'Go Green — Try EV Rides',   'Zero-emission rides now available in Yaoundé & Douala.',    'Try Green',  'leaf-outline',     '#00A651', 'home', 9),
  ('internal', 'Commuter Pass — Save 25%',  'Buy a 40-ride pack and save 25% on your daily commute.',   'Get Pass',   'train-outline',    '#FF00BF', 'home', 8),
  ('internal', 'Refer & Earn',              'Invite friends to MOBO — you both get ride credits.',       'Share Now',  'people-outline',   '#0077CC', 'auth', 7),
  ('internal', 'Benskin — Fastest in Town!','Beat traffic with our moto taxi. From 500 FCFA.',          'Book Moto',  'bicycle-outline',  '#8B4513', 'home', 6),
  ('business', 'La Belle Époque — 15% Off', 'Fine dining in Bastos, Yaoundé. Show your MOBO receipt.',  'View Menu',  'restaurant-outline','#E74C3C','all',  5),
  ('business', 'ModeAfrica Boutique',       'Fashion & accessories — Akwa, Douala.',                    'Shop Now',   'bag-handle-outline','#8E44AD','home', 4),
  ('business', 'FitCam Gym — Free Trial',   '3-day free pass for MOBO riders. Yaoundé & Douala.',       'Claim Pass', 'fitness-outline',  '#1ABC9C', 'home', 3),
  ('business', 'Café Terrasse — Happy Hour','Coffee & pastries, Hippodrome. Code RIDE10.',              'Get Code',   'cafe-outline',     '#F39C12', 'auth', 2),
  ('business', 'PharmaCam — Home Delivery', 'Medicines delivered in 30 min. Yaoundé & Douala.',         'Order Now',  'medkit-outline',   '#2980B9', 'ride', 1)
ON CONFLICT DO NOTHING;
