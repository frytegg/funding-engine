import { ExchangeConfig } from '../../types/common';
import * as dotenv from 'dotenv';

dotenv.config();

export const bitgetConfig: ExchangeConfig = {
  name: 'bitget',
  apiKey: process.env.BITGET_API_KEY || '',
  apiSecret: process.env.BITGET_API_SECRET || '',
  passphrase: process.env.BITGET_PASSPHRASE || '',
  baseUrl: process.env.BITGET_TESTNET === 'true' 
    ? 'https://api.bitget.com' // Note: Bitget uses same URL for testnet/mainnet
    : 'https://api.bitget.com',
  wsUrl: process.env.BITGET_TESTNET === 'true'
    ? 'wss://ws.bitget.com/v2/ws/public'
    : 'wss://ws.bitget.com/v2/ws/public',
  testnet: process.env.BITGET_TESTNET === 'true',
  capitalAllocation: 0.25, // 25% of total capital
  fees: {
    maker: 0.0002, // 0.02%
    taker: 0.0006, // 0.06%
  },
  rateLimits: {
    requests: 200,
    interval: 60000, // per minute
  },
  leverage: {
    max: 100,
    default: 3,
  },
};

export const bitgetEndpoints = {
  fundingRate: '/api/v2/mix/market/history-fund-rate',
  orderbook: '/api/v2/mix/market/orderbook',
  placeOrder: '/api/v2/mix/order/place-order',
  cancelOrder: '/api/v2/mix/order/cancel-order',
  getOrder: '/api/v2/mix/order/detail',
  getPosition: '/api/v2/mix/position/single-position',
  setLeverage: '/api/v2/mix/account/set-leverage',
  getBalance: '/api/v2/mix/account/account',
  getSymbols: '/api/v2/mix/market/contracts',
  getTradingFees: '/api/v2/mix/market/contracts',
  setMarginMode: '/api/v2/mix/account/set-margin-mode',
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