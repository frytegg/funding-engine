import * as dotenv from 'dotenv';

dotenv.config();

export const databaseConfig = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  enableRealtime: true,
  maxConnections: 10,
  connectionTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

export const tableNames = {
  fundingRates: 'funding_rates',
  orderbookDepth: 'orderbook_depth',
  trades: 'trades',
  positions: 'positions',
  symbolMappings: 'symbol_mappings',
  strategyPerformance: 'strategy_performance',
  riskMetrics: 'risk_metrics',
};

export const databaseQueries = {
  // Funding rates
  insertFundingRate: `
    INSERT INTO funding_rates (exchange, symbol, funding_rate, timestamp)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (exchange, symbol, timestamp) DO UPDATE SET
    funding_rate = EXCLUDED.funding_rate
  `,
  
  getFundingRatesHistory: `
    SELECT * FROM funding_rates 
    WHERE exchange = $1 AND symbol = $2 
    AND timestamp >= $3
    ORDER BY timestamp DESC
  `,
  
  // Orderbook depth
  insertOrderbookDepth: `
    INSERT INTO orderbook_depth (exchange, symbol, bid_depth, ask_depth, timestamp)
    VALUES ($1, $2, $3, $4, $5)
  `,
  
  // Trades
  insertTrade: `
    INSERT INTO trades (strategy_id, exchange, symbol, side, price, quantity, leverage, order_type, status, fees)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `,
  
  // Positions
  insertPosition: `
    INSERT INTO positions (strategy_id, exchange, symbol, side, entry_price, quantity, leverage, liquidation_price, tp_price, sl_price, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
  `,
  
  updatePosition: `
    UPDATE positions 
    SET quantity = $1, status = $2, updated_at = NOW()
    WHERE id = $3
  `,
  
  getActivePositions: `
    SELECT * FROM positions 
    WHERE status = 'active'
    ORDER BY created_at DESC
  `,
  
  // Symbol mappings
  getSymbolMapping: `
    SELECT * FROM symbol_mappings 
    WHERE base_symbol = $1
  `,
  
  insertSymbolMapping: `
    INSERT INTO symbol_mappings (base_symbol, bybit_symbol, bitget_symbol, kucoin_symbol, hyperliquid_symbol)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (base_symbol) DO UPDATE SET
    bybit_symbol = EXCLUDED.bybit_symbol,
    bitget_symbol = EXCLUDED.bitget_symbol,
    kucoin_symbol = EXCLUDED.kucoin_symbol,
    hyperliquid_symbol = EXCLUDED.hyperliquid_symbol
  `,
}; 