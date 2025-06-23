-- Funding rates history
CREATE TABLE IF NOT EXISTS funding_rates (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  funding_rate DECIMAL(10, 8) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(exchange, symbol, timestamp)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_funding_rates_exchange_symbol_timestamp 
ON funding_rates(exchange, symbol, timestamp DESC);

-- Order book snapshots
CREATE TABLE IF NOT EXISTS orderbook_depth (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  bid_depth JSONB NOT NULL,
  ask_depth JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_orderbook_exchange_symbol_timestamp 
ON orderbook_depth(exchange, symbol, timestamp DESC);

-- Trade executions
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  strategy_id UUID NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  leverage INTEGER NOT NULL,
  order_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  fees DECIMAL(20, 8) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for strategy queries
CREATE INDEX IF NOT EXISTS idx_trades_strategy_id ON trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_exchange_symbol ON trades(exchange, symbol);

-- Active positions
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  strategy_id UUID NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
  entry_price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  leverage INTEGER NOT NULL,
  liquidation_price DECIMAL(20, 8),
  tp_price DECIMAL(20, 8),
  sl_price DECIMAL(20, 8),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closing', 'closed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for position queries
CREATE INDEX IF NOT EXISTS idx_positions_strategy_id ON positions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_exchange_symbol ON positions(exchange, symbol);

-- Symbol mappings (dynamic cross-exchange symbol mappings)
CREATE TABLE IF NOT EXISTS symbol_mappings (
  id SERIAL PRIMARY KEY,
  standard_symbol VARCHAR(50) NOT NULL UNIQUE,
  bybit_symbol VARCHAR(50),
  bitget_symbol VARCHAR(50),
  kucoin_symbol VARCHAR(50),
  hyperliquid_symbol VARCHAR(50),
  exchange_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_symbol_mappings_standard_symbol ON symbol_mappings(standard_symbol);
CREATE INDEX IF NOT EXISTS idx_symbol_mappings_active ON symbol_mappings(is_active);
CREATE INDEX IF NOT EXISTS idx_symbol_mappings_exchange_count ON symbol_mappings(exchange_count DESC);

-- Strategy performance tracking
CREATE TABLE IF NOT EXISTS strategy_performance (
  id SERIAL PRIMARY KEY,
  strategy_id UUID NOT NULL,
  base_symbol VARCHAR(50) NOT NULL,
  long_exchange VARCHAR(50) NOT NULL,
  short_exchange VARCHAR(50) NOT NULL,
  entry_time TIMESTAMP NOT NULL,
  exit_time TIMESTAMP,
  expected_profit_bps DECIMAL(10, 2),
  realized_profit_usd DECIMAL(20, 8),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Risk metrics tracking
CREATE TABLE IF NOT EXISTS risk_metrics (
  id SERIAL PRIMARY KEY,
  total_exposure DECIMAL(20, 8) NOT NULL,
  margin_utilization DECIMAL(5, 2) NOT NULL,
  unrealized_pnl DECIMAL(20, 8) NOT NULL,
  near_liquidation_count INTEGER DEFAULT 0,
  max_drawdown DECIMAL(5, 2),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Symbol mappings will be populated dynamically by the SymbolMappingService
-- The service fetches 467+ symbols automatically from all exchange APIs
-- and creates cross-exchange mappings for symbols available on 2+ exchanges

-- Optional: Insert a few common symbols for immediate testing (will be overwritten by dynamic system)
INSERT INTO symbol_mappings (standard_symbol, bybit_symbol, bitget_symbol, kucoin_symbol, hyperliquid_symbol, exchange_count, is_active) 
VALUES 
  ('BTC/USDT', 'BTCUSDT', 'BTCUSDT', 'XBTUSDTM', 'BTC', 4, true),
  ('ETH/USDT', 'ETHUSDT', 'ETHUSDT', 'ETHUSDTM', 'ETH', 4, true),
  ('SOL/USDT', 'SOLUSDT', 'SOLUSDT', 'SOLUSDTM', 'SOL', 4, true)
ON CONFLICT (standard_symbol) DO UPDATE SET
  bybit_symbol = EXCLUDED.bybit_symbol,
  bitget_symbol = EXCLUDED.bitget_symbol,
  kucoin_symbol = EXCLUDED.kucoin_symbol,
  hyperliquid_symbol = EXCLUDED.hyperliquid_symbol,
  exchange_count = EXCLUDED.exchange_count,
  updated_at = NOW(); 