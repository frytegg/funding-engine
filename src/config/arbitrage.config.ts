import { ArbitrageConfig } from '../types/common';
import * as dotenv from 'dotenv';

dotenv.config();

export const arbitrageConfig: ArbitrageConfig = {
  minArbBps: parseInt(process.env.MIN_ARB_BPS || '30'),
  minFundingRateThreshold: parseFloat(process.env.MIN_FUNDING_RATE_THRESHOLD || '0.4'),
  analysisWindowHours: parseInt(process.env.ANALYSIS_WINDOW_HOURS || '72'),
  maxPositionSizePerExchange: parseInt(process.env.MAX_POSITION_SIZE_PER_EXCHANGE || '1250'),
  killSwitchThresholds: {
    nearLiquidationPercent: parseInt(process.env.NEAR_LIQUIDATION_PERCENT || '15'),
    maxDrawdownPercent: parseInt(process.env.MAX_DRAWDOWN_PERCENT || '10'),
  },
  totalCapital: parseInt(process.env.TOTAL_CAPITAL || '5000'),
  symbols: [
    'BTC/USDT',
    'ETH/USDT',
    'SOL/USDT',
    'AVAX/USDT',
    'MATIC/USDT',
    'ADA/USDT',
    'DOT/USDT',
    'LINK/USDT',
    'UNI/USDT',
    'ATOM/USDT',
  ],
  checkIntervalMs: 60000, // 1 minute
};

export const exchangeWeights = {
  bybit: 0.25,
  bitget: 0.25,
  kucoin: 0.25,
  hyperliquid: 0.25,
};

export const riskLimits = {
  maxPositionsPerExchange: 3,
  maxTotalPositions: 8,
  maxConcentrationPerSymbol: 0.3, // 30% of total capital
  minProfitThresholdUsd: 10,
  maxSlippageBps: 20,
  maxOrderBookDepthUsd: 10000,
};

export const tradingParams = {
  defaultLeverage: 3,
  maxLeverage: 5,
  orderTimeoutMs: 30000,
  positionCheckIntervalMs: 5000,
  dataCollectionIntervalMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
}; 