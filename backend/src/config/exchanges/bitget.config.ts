import { IExchangeConfig } from '../interfaces/IExchangeConfig';

export const bitgetConfig: IExchangeConfig = {
  name: 'bitget',
  apiKey: process.env.BITGET_API_KEY || '',
  apiSecret: process.env.BITGET_API_SECRET || '',
  passphrase: process.env.BITGET_PASSPHRASE || '',
  baseUrl: process.env.BITGET_SANDBOX === 'true'
    ? 'https://api.bitget-sandbox.com'
    : 'https://api.bitget.com',
  wsUrl: process.env.BITGET_SANDBOX === 'true'
    ? 'wss://ws.bitget-sandbox.com'
    : 'wss://ws.bitget.com',
  testnet: process.env.BITGET_SANDBOX === 'true',
  capitalAllocation: 1250, // $5000 / 4 exchanges
  fees: {
    maker: 0.0002, // 0.02%
    taker: 0.0006, // 0.06%
  },
  rateLimits: {
    requests: 100,
    interval: 60000, // 60 seconds
  },
  leverage: {
    max: 125,
    default: 5,
  },
}; 