import { IExchangeConfig } from '../interfaces/IExchangeConfig';

export const bybitConfig: IExchangeConfig = {
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
  capitalAllocation: 1250, // $5000 / 4 exchanges
  fees: {
    maker: 0.0001, // 0.01%
    taker: 0.0006, // 0.06%
  },
  rateLimits: {
    requests: 120,
    interval: 60000, // 60 seconds
  },
  leverage: {
    max: 100,
    default: 5,
  },
}; 