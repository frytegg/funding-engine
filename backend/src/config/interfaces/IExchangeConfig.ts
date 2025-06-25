export interface IExchangeConfig {
  name: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // For KuCoin and Bitget
  privateKey?: string; // For Hyperliquid
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
    interval: number; // in milliseconds
  };
  leverage: {
    max: number;
    default: number;
  };
}

export interface ArbitrageConfig {
  minArbBps: number; // Minimum arbitrage in basis points
  minFundingRateThreshold: number; // 40% over analysis window
  analysisWindowHours: number; // 3 days = 72 hours
  maxPositionSize: number; // Per exchange in USD
  killSwitchThresholds: {
    nearLiquidationPercent: number; // 80%
    maxDrawdownPercent: number; // 10%
  };
  riskManagement: {
    totalCapital: number;
    positionSizePercent: number; // 20% of total capital per position
    maxConcurrentPositions: number;
  };
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
} 