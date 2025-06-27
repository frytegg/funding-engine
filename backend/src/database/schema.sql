-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Funding rates history table
CREATE TABLE IF NOT EXISTS funding_rates (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  funding_rate DECIMAL(10, 8) NOT NULL,
  next_funding_time TIMESTAMP,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order book snapshots table
CREATE TABLE IF NOT EXISTS orderbook_depth (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  bid_depth JSONB NOT NULL,
  ask_depth JSONB NOT NULL,
  spread DECIMAL(10, 8),
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trade executions table
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) UNIQUE NOT NULL,
  strategy_id UUID NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  leverage INTEGER DEFAULT 1,
  order_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('filled', 'partial', 'failed', 'cancelled')),
  fees DECIMAL(20, 8) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Active positions table
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  strategy_id UUID NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
  entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8) NOT NULL,
  leverage INTEGER NOT NULL DEFAULT 1,
  liquidation_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'closing')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(strategy_id, exchange, symbol)
);

-- Symbol mappings table
CREATE TABLE IF NOT EXISTS symbol_mappings (
  id SERIAL PRIMARY KEY,
  base_symbol VARCHAR(50) NOT NULL UNIQUE,
  bybit_symbol VARCHAR(50),
  bitget_symbol VARCHAR(50),
  kucoin_symbol VARCHAR(50),
  hyperliquid_symbol VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Arbitrage opportunities log
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

-- Risk metrics tracking
CREATE TABLE IF NOT EXISTS risk_metrics (
  id SERIAL PRIMARY KEY,
  total_exposure DECIMAL(20, 8) NOT NULL,
  total_pnl DECIMAL(20, 8) NOT NULL,
  max_drawdown DECIMAL(10, 6) NOT NULL,
  active_positions INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- System logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata JSONB,
  source VARCHAR(100),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes separately (PostgreSQL syntax)
CREATE INDEX IF NOT EXISTS idx_funding_rates_exchange_symbol_timestamp 
ON funding_rates(exchange, symbol, timestamp);

CREATE INDEX IF NOT EXISTS idx_funding_rates_timestamp 
ON funding_rates(timestamp);

CREATE INDEX IF NOT EXISTS idx_orderbook_exchange_symbol_timestamp 
ON orderbook_depth(exchange, symbol, timestamp);

CREATE INDEX IF NOT EXISTS idx_trades_strategy_id 
ON trades(strategy_id);

CREATE INDEX IF NOT EXISTS idx_trades_exchange_symbol 
ON trades(exchange, symbol);

CREATE INDEX IF NOT EXISTS idx_positions_strategy_id 
ON positions(strategy_id);

CREATE INDEX IF NOT EXISTS idx_positions_status 
ON positions(status);

CREATE INDEX IF NOT EXISTS idx_arb_ops_symbol_timestamp 
ON arbitrage_opportunities(symbol, created_at);

CREATE INDEX IF NOT EXISTS idx_arb_ops_status 
ON arbitrage_opportunities(status);

CREATE INDEX IF NOT EXISTS idx_risk_metrics_timestamp 
ON risk_metrics(timestamp);

CREATE INDEX IF NOT EXISTS idx_logs_level_timestamp 
ON system_logs(level, timestamp);

CREATE INDEX IF NOT EXISTS idx_logs_source 
ON system_logs(source);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_symbol_mappings_updated_at BEFORE UPDATE ON symbol_mappings
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Insert some basic symbol mappings for common perpetuals
INSERT INTO symbol_mappings (base_symbol, bybit_symbol, bitget_symbol, kucoin_symbol, hyperliquid_symbol) VALUES
('BTC', 'BTCUSDT', 'BTCUSDT_UMCBL', 'XBTUSDTM', 'BTC'),
('ETH', 'ETHUSDT', 'ETHUSDT_UMCBL', 'ETHUSDTM', 'ETH'),
('SOL', 'SOLUSDT', 'SOLUSDT_UMCBL', 'SOLUSDTM', 'SOL'),
('DOGE', 'DOGEUSDT', 'DOGEUSDT_UMCBL', 'DOGEUSDTM', 'DOGE'),
('AVAX', 'AVAXUSDT', 'AVAXUSDT_UMCBL', 'AVAXUSDTM', 'AVAX')
ON CONFLICT (base_symbol) DO NOTHING; 