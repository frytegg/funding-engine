// Common types for the funding rate arbitrage engine

export interface FundingRate {
  exchange: string;
  symbol: string;
  fundingRate: number;
  timestamp: Date;
  nextFundingTime: Date;
}

export interface OrderBook {
  exchange: string;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: Date;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface TradeOrder {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
  orderType: 'market' | 'limit' | 'IOC' | 'FOK';
  leverage?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
}

export interface TradeResult {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  status: 'filled' | 'partial' | 'cancelled' | 'failed';
  timestamp: Date;
}

export interface Position {
  exchange: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  margin: number;
  marginRatio: number;
  timestamp: Date;
}

export interface ArbitrageOpportunity {
  baseSymbol: string;
  longExchange: string;
  shortExchange: string;
  longSymbol: string;
  shortSymbol: string;
  fundingRate: number;
  expectedReturn: number;
  estimatedProfitBps: number;
  requiredCapital: number;
  maxSize: number;
  longOrderBook: OrderBook;
  shortOrderBook: OrderBook;
  confidence: number;
  timestamp: Date;
}

export interface TPSLLevels {
  longTP: number;
  longSL: number;
  shortTP: number;
  shortSL: number;
}

export interface ExchangeSymbols {
  base: string;
  bybit: string;
  bitget: string;
  kucoin: string;
  hyperliquid: string;
}

export interface StrategyPosition {
  id: string;
  strategyId: string;
  longPosition: Position;
  shortPosition: Position;
  status: 'active' | 'closing' | 'closed';
  entryTime: Date;
  expectedProfit: number;
  realizedProfit?: number;
}

export interface RiskMetrics {
  totalExposure: number;
  marginUtilization: number;
  unrealizedPnl: number;
  nearLiquidationCount: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface ExchangeConfig {
  name: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  baseUrl: string;
  wsUrl: string;
  testnet: boolean;
  capitalAllocation: number;
  fees: {
    maker: number;
    taker: number;
  };
  rateLimits: {
    requests: number;
    interval: number;
  };
  leverage: {
    max: number;
    default: number;
  };
}

export interface ArbitrageConfig {
  minArbBps: number;
  minFundingRateThreshold: number;
  analysisWindowHours: number;
  maxPositionSizePerExchange: number;
  killSwitchThresholds: {
    nearLiquidationPercent: number;
    maxDrawdownPercent: number;
  };
  totalCapital: number;
  symbols: string[];
  checkIntervalMs: number;
} 