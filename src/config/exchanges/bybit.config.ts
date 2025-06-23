import { ExchangeConfig } from '../../types/common';
import * as dotenv from 'dotenv';

dotenv.config();

export const bybitConfig: ExchangeConfig = {
  name: 'bybit',
  apiKey: process.env.BYBIT_API_KEY || '',
  apiSecret: process.env.BYBIT_API_SECRET || '',
  baseUrl: process.env.BYBIT_TESTNET === 'true' 
    ? 'https://api-testnet.bybit.com'
    : 'https://api.bybit.com',
  wsUrl: process.env.BYBIT_TESTNET === 'true'
    ? 'wss://stream-testnet.bybit.com'
    : 'wss://stream.bybit.com',
  testnet: process.env.BYBIT_TESTNET === 'true',
  capitalAllocation: parseInt(process.env.TOTAL_CAPITAL || '5000') * 0.25,
  fees: {
    maker: 0.0001, // 0.01%
    taker: 0.0006, // 0.06%
  },
  rateLimits: {
    requests: 120,
    interval: 60000, // 1 minute
  },
  leverage: {
    max: 50,
    default: 3,
  },
};

export const bybitEndpoints = {
  fundingRate: '/v5/market/funding/history',
  orderbook: '/v5/market/orderbook',
  placeOrder: '/v5/order/create',
  positions: '/v5/position/list',
  balance: '/v5/account/wallet-balance',
  leverage: '/v5/position/set-leverage',
  marginMode: '/v5/position/set-margin-mode',
  instruments: '/v5/market/instruments-info',
};

export const bybitSymbolMappings: Record<string, string> = {
  'BTC/USDT': 'BTCUSDT',
  'ETH/USDT': 'ETHUSDT',
  'SOL/USDT': 'SOLUSDT',
  'AVAX/USDT': 'AVAXUSDT',
  'MATIC/USDT': 'MATICUSDT',
  'ADA/USDT': 'ADAUSDT',
  'DOT/USDT': 'DOTUSDT',
  'LINK/USDT': 'LINKUSDT',
  'UNI/USDT': 'UNIUSDT',
  'ATOM/USDT': 'ATOMUSDT',
}; 