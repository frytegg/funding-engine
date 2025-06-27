-- Add missing columns to existing tables

-- 1. Add next_funding_time to funding_rates table
ALTER TABLE funding_rates 
ADD COLUMN IF NOT EXISTS next_funding_time TIMESTAMP;

-- 2. Add spread column to orderbook_depth table  
ALTER TABLE orderbook_depth 
ADD COLUMN IF NOT EXISTS spread DECIMAL(10, 8);

-- 3. Add missing columns to positions table
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS current_price DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS unrealized_pnl DECIMAL(20, 8) DEFAULT 0;

-- 4. Update positions status values to match engine expectations
-- Change 'active' to 'open' and 'closing' remains the same
UPDATE positions SET status = 'open' WHERE status = 'active';

-- 5. Add missing columns to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS order_id VARCHAR(100) UNIQUE;

-- 6. Create arbitrage_opportunities table (missing from your schema)
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
  id SERIAL PRIMARY KEY,
  strategy_id UUID,
  symbol VARCHAR(50) NOT NULL,
  long_exchange VARCHAR(50) NOT NULL,
  short_exchange VARCHAR(50) NOT NULL,
  long_funding_rate DECIMAL(10, 8) NOT NULL,
  short_funding_rate DECIMAL(10, 8) NOT NULL,
  funding_rate_diff DECIMAL(10, 8) NOT NULL,
  arb_basis_points INTEGER NOT NULL,
  estimated_profit DECIMAL(20, 8) NOT NULL,
  optimal_size DECIMAL(20, 8) NOT NULL,
  confidence DECIMAL(5, 4) NOT NULL,
  risk_score DECIMAL(5, 4) NOT NULL,
  status VARCHAR(20) DEFAULT 'identified' CHECK (status IN ('identified', 'executed', 'rejected', 'expired')),
  executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Create system_logs table (missing from your schema)
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata JSONB,
  source VARCHAR(100),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- 8. Add indexes for new tables
CREATE INDEX IF NOT EXISTS idx_arb_ops_symbol_timestamp 
ON arbitrage_opportunities(symbol, created_at);

CREATE INDEX IF NOT EXISTS idx_arb_ops_status 
ON arbitrage_opportunities(status);

CREATE INDEX IF NOT EXISTS idx_logs_level_timestamp 
ON system_logs(level, timestamp);

CREATE INDEX IF NOT EXISTS idx_logs_source 
ON system_logs(source);

-- 9. Update symbol_mappings to match engine expectations
-- Rename standard_symbol to base_symbol if needed
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'symbol_mappings' 
               AND column_name = 'standard_symbol') THEN
        ALTER TABLE symbol_mappings RENAME COLUMN standard_symbol TO base_symbol;
    END IF;
END $$;

-- 10. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 11. Update positions table constraints to match engine expectations
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_status_check;
ALTER TABLE positions ADD CONSTRAINT positions_status_check 
CHECK (status IN ('open', 'closed', 'closing'));

-- 12. Update trades table constraints
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades ADD CONSTRAINT trades_status_check 
CHECK (status IN ('filled', 'partial', 'failed', 'cancelled'));

-- 13. Create trigger for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop triggers if they exist, then create them
DROP TRIGGER IF EXISTS update_positions_updated_at ON positions;
CREATE TRIGGER update_positions_updated_at 
BEFORE UPDATE ON positions
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_symbol_mappings_updated_at ON symbol_mappings;
CREATE TRIGGER update_symbol_mappings_updated_at 
BEFORE UPDATE ON symbol_mappings
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- First, let's identify and fix any base symbols that contain 'USDT'
CREATE TEMP TABLE IF NOT EXISTS symbol_fixes AS
SELECT 
  id,
  REPLACE(base_symbol, 'USDT', '') as correct_base_symbol,
  base_symbol as old_base_symbol,
  bybit_symbol,
  bitget_symbol,
  kucoin_symbol,
  hyperliquid_symbol
FROM symbol_mappings
WHERE base_symbol LIKE '%USDT%';

-- Update the existing rows with corrected base symbols
UPDATE symbol_mappings sm
SET base_symbol = sf.correct_base_symbol
FROM symbol_fixes sf
WHERE sm.id = sf.id;

-- Now fix the RAY token mapping
DELETE FROM symbol_mappings WHERE base_symbol IN ('RAYUSDT', 'RAYDIUMUSDT');

INSERT INTO symbol_mappings (base_symbol, bybit_symbol, bitget_symbol, kucoin_symbol, hyperliquid_symbol) 
VALUES ('RAY', 'RAYDIUMUSDT', NULL, NULL, NULL)
ON CONFLICT (base_symbol) DO UPDATE 
SET 
  bybit_symbol = EXCLUDED.bybit_symbol,
  updated_at = NOW();

-- Now we can safely add the check constraint
ALTER TABLE symbol_mappings 
ADD CONSTRAINT chk_base_symbol_no_usdt 
CHECK (base_symbol NOT LIKE '%USDT%'); 