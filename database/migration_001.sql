-- Migration 001: Add expo_push_token, corporate accounts support
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS corporate_account_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS corporate_role VARCHAR(20) DEFAULT 'employee' CHECK (corporate_role IN ('admin','manager','employee'));

CREATE TABLE IF NOT EXISTS corporate_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  admin_user_id UUID NOT NULL REFERENCES users(id),
  billing_email VARCHAR(255) NOT NULL,
  monthly_budget INTEGER DEFAULT 0,
  current_spend INTEGER DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'XAF',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
  spending_limit INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(corporate_account_id, user_id)
);

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id),
  discount_applied INTEGER NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promo_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_users_push_token ON users(expo_push_token) WHERE expo_push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corporate_members ON corporate_members(corporate_account_id, user_id);
