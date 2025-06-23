import { ExchangeConfig } from '../../types/common';
import * as dotenv from 'dotenv';

dotenv.config();

export const bitgetConfig: ExchangeConfig = {
  name: 'bitget',
  apiKey: process.env.BITGET_API_KEY || '',
  apiSecret: process.env.BITGET_API_SECRET || '',
  passphrase: process.env.BITGET_PASSPHRASE || '',
  baseUrl: process.env.BITGET_TESTNET === 'true'
    ? 'https://api.bitget.com'
    : 'https://api.bitget.com',
  wsUrl: process.env.BITGET_TESTNET === 'true'
    ? 'wss://ws.bitget.com/mix/v1/stream'
    : 'wss://ws.bitget.com/mix/v1/stream',
  testnet: process.env.BITGET_TESTNET === 'true',
  capitalAllocation: parseInt(process.env.TOTAL_CAPITAL || '5000') * 0.25,
  fees: {
    maker: 0.0002, // 0.02%
    taker: 0.0006, // 0.06%
  },
  rateLimits: {
    requests: 100,
    interval: 60000, // 1 minute
  },
  leverage: {
    max: 125,
    default: 3,
  },
};

export const bitgetEndpoints = {
  fundingRate: '/api/mix/v1/market/funding-time',
  orderbook: '/api/mix/v1/market/depth',
  placeOrder: '/api/mix/v1/order/placeOrder',
  positions: '/api/mix/v1/position/allPosition',
  balance: '/api/mix/v1/account/account',
  leverage: '/api/mix/v1/account/setLeverage',
  marginMode: '/api/mix/v1/account/setMarginMode',
  instruments: '/api/mix/v1/market/contracts',
};

export const bitgetSymbolMappings: Record<string, string> = {
  'BTC/USDT': 'BTCUSDT_UMCBL',
  'ETH/USDT': 'ETHUSDT_UMCBL',
  'SOL/USDT': 'SOLUSDT_UMCBL',
  'AVAX/USDT': 'AVAXUSDT_UMCBL',
  'MATIC/USDT': 'MATICUSDT_UMCBL',
  'ADA/USDT': 'ADAUSDT_UMCBL',
  'DOT/USDT': 'DOTUSDT_UMCBL',
  'LINK/USDT': 'LINKUSDT_UMCBL',
  'UNI/USDT': 'UNIUSDT_UMCBL',
  'ATOM/USDT': 'ATOMUSDT_UMCBL',
}; 