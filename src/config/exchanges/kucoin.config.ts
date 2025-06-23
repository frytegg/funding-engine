import { ExchangeConfig } from '../../types/common';
import * as dotenv from 'dotenv';

dotenv.config();

export const kucoinConfig: ExchangeConfig = {
  name: 'kucoin',
  apiKey: process.env.KUCOIN_API_KEY || '',
  apiSecret: process.env.KUCOIN_API_SECRET || '',
  passphrase: process.env.KUCOIN_PASSPHRASE || '',
  baseUrl: process.env.KUCOIN_TESTNET === 'true'
    ? 'https://api-sandbox-futures.kucoin.com'
    : 'https://api-futures.kucoin.com',
  wsUrl: process.env.KUCOIN_TESTNET === 'true'
    ? 'wss://ws-api-sandbox.kucoin.com/endpoint'
    : 'wss://ws-api-spot.kucoin.com/endpoint',
  testnet: process.env.KUCOIN_TESTNET === 'true',
  capitalAllocation: parseInt(process.env.TOTAL_CAPITAL || '5000') * 0.25,
  fees: {
    maker: 0.00015, // 0.015%
    taker: 0.0005, // 0.05%
  },
  rateLimits: {
    requests: 100,
    interval: 60000, // 1 minute
  },
  leverage: {
    max: 100,
    default: 3,
  },
};

export const kucoinEndpoints = {
  fundingRate: '/api/v1/funding-rate/history',
  orderbook: '/api/v1/level2/depth',
  placeOrder: '/api/v1/orders',
  positions: '/api/v1/positions',
  balance: '/api/v1/account-overview',
  leverage: '/api/v1/position',
  marginMode: '/api/v1/position/margin-mode',
  instruments: '/api/v1/contracts/active',
};

export const kucoinSymbolMappings: Record<string, string> = {
  'BTC/USDT': 'XBTUSDTM',
  'ETH/USDT': 'ETHUSDTM',
  'SOL/USDT': 'SOLUSDTM',
  'AVAX/USDT': 'AVAXUSDTM',
  'MATIC/USDT': 'MATICUSDTM',
  'ADA/USDT': 'ADAUSDTM',
  'DOT/USDT': 'DOTUSDTM',
  'LINK/USDT': 'LINKUSDTM',
  'UNI/USDT': 'UNIUSDTM',
  'ATOM/USDT': 'ATOMUSDTM',
}; 