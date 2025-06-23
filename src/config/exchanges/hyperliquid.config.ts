import { ExchangeConfig } from '../../types/common';
import * as dotenv from 'dotenv';

dotenv.config();

export const hyperliquidConfig: ExchangeConfig = {
  name: 'hyperliquid',
  apiKey: process.env.HYPERLIQUID_PRIVATE_KEY || '',
  apiSecret: '', // Hyperliquid uses private key instead
  baseUrl: process.env.HYPERLIQUID_TESTNET === 'true'
    ? 'https://api.hyperliquid-testnet.xyz'
    : 'https://api.hyperliquid.xyz',
  wsUrl: process.env.HYPERLIQUID_TESTNET === 'true'
    ? 'wss://api.hyperliquid-testnet.xyz/ws'
    : 'wss://api.hyperliquid.xyz/ws',
  testnet: process.env.HYPERLIQUID_TESTNET === 'true',
  capitalAllocation: parseInt(process.env.TOTAL_CAPITAL || '5000') * 0.25,
  fees: {
    maker: 0.00005, // 0.005%
    taker: 0.0003, // 0.03%
  },
  rateLimits: {
    requests: 100,
    interval: 60000, // 1 minute
  },
  leverage: {
    max: 50,
    default: 3,
  },
};

export const hyperliquidEndpoints = {
  info: '/info',
  exchange: '/exchange',
  fundingRate: '/info',
  orderbook: '/info',
  placeOrder: '/exchange',
  positions: '/info',
  balance: '/info',
};

export const hyperliquidSymbolMappings: Record<string, string> = {
  'BTC/USDT': 'BTC',
  'ETH/USDT': 'ETH',
  'SOL/USDT': 'SOL',
  'AVAX/USDT': 'AVAX',
  'MATIC/USDT': 'MATIC',
  'ADA/USDT': 'ADA',
  'DOT/USDT': 'DOT',
  'LINK/USDT': 'LINK',
  'UNI/USDT': 'UNI',
  'ATOM/USDT': 'ATOM',
}; 