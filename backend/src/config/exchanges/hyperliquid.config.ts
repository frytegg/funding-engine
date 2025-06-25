import { IExchangeConfig } from '../interfaces/IExchangeConfig';

export const hyperliquidConfig: IExchangeConfig = {
  name: 'hyperliquid',
  apiKey: '', // Not used for Hyperliquid
  apiSecret: '', // Not used for Hyperliquid
  privateKey: process.env.HYPERLIQUID_PRIVATE_KEY || '',
  baseUrl: process.env.HYPERLIQUID_TESTNET === 'true'
    ? 'https://api.hyperliquid-testnet.xyz'
    : 'https://api.hyperliquid.xyz',
  wsUrl: process.env.HYPERLIQUID_TESTNET === 'true'
    ? 'wss://api.hyperliquid-testnet.xyz/ws'
    : 'wss://api.hyperliquid.xyz/ws',
  testnet: process.env.HYPERLIQUID_TESTNET === 'true',
  capitalAllocation: 1250, // $5000 / 4 exchanges
  fees: {
    maker: 0.0002, // 0.02%
    taker: 0.0005, // 0.05%
  },
  rateLimits: {
    requests: 1200,
    interval: 60000, // 60 seconds
  },
  leverage: {
    max: 50,
    default: 5,
  },
}; 