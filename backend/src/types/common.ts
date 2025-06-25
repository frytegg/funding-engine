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
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][]; // [price, quantity]
  timestamp: Date;
}

export interface Position {
  id: string;
  strategyId: string;
  exchange: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  leverage: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  status: 'open' | 'closed' | 'closing';
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeOrder {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'ioc';
  quantity: number;
  price?: number;
  leverage?: number;
  reduceOnly?: boolean;
}

export interface TradeResult {
  orderId: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  fees: number;
  status: 'filled' | 'partial' | 'failed';
  timestamp: Date;
}

export interface ArbitrageOpportunity {
  symbol: string;
  longExchange: string;
  shortExchange: string;
  longFundingRate: number;
  shortFundingRate: number;
  fundingRateDiff: number;
  arbBasisPoints: number;
  estimatedProfit: number;
  optimalSize: number;
  confidence: number;
  riskScore: number;
}

export interface ExchangeSymbols {
  base: string;
  bybit?: string;
  bitget?: string;
  kucoin?: string;
  hyperliquid?: string;
}

export interface TPSLLevels {
  longTP: number;
  longSL: number;
  shortTP: number;
  shortSL: number;
}

export interface RiskMetrics {
  totalExposure: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
} 