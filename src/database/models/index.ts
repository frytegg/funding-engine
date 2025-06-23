// Database model interfaces

export interface FundingRateModel {
  id: number;
  exchange: string;
  symbol: string;
  funding_rate: number;
  timestamp: Date;
  created_at: Date;
}

export interface OrderBookDepthModel {
  id: number;
  exchange: string;
  symbol: string;
  bid_depth: any; // JSONB
  ask_depth: any; // JSONB
  timestamp: Date;
  created_at: Date;
}

export interface TradeModel {
  id: number;
  strategy_id: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  leverage: number;
  order_type: string;
  status: string;
  fees: number;
  created_at: Date;
}

export interface PositionModel {
  id: number;
  strategy_id: string;
  exchange: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  quantity: number;
  leverage: number;
  liquidation_price: number;
  tp_price?: number;
  sl_price?: number;
  status: 'active' | 'closing' | 'closed';
  created_at: Date;
  updated_at: Date;
}

export interface SymbolMappingModel {
  id: number;
  standard_symbol: string;
  bybit_symbol?: string;
  bitget_symbol?: string;
  kucoin_symbol?: string;
  hyperliquid_symbol?: string;
  exchange_count: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StrategyPerformanceModel {
  id: number;
  strategy_id: string;
  base_symbol: string;
  long_exchange: string;
  short_exchange: string;
  entry_time: Date;
  exit_time?: Date;
  expected_profit_bps?: number;
  realized_profit_usd?: number;
  status: string;
  created_at: Date;
}

export interface RiskMetricsModel {
  id: number;
  total_exposure: number;
  margin_utilization: number;
  unrealized_pnl: number;
  near_liquidation_count: number;
  max_drawdown?: number;
  timestamp: Date;
} 