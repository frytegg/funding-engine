import { IExchangeConfig } from '../interfaces/IExchangeConfig';

export const kucoinConfig: IExchangeConfig = {
  name: 'kucoin',
  apiKey: process.env.KUCOIN_API_KEY || '',
  apiSecret: process.env.KUCOIN_API_SECRET || '',
  passphrase: process.env.KUCOIN_PASSPHRASE || '',
  baseUrl: process.env.KUCOIN_SANDBOX === 'true'
    ? 'https://api-sandbox-futures.kucoin.com'
    : 'https://api-futures.kucoin.com',
  wsUrl: process.env.KUCOIN_SANDBOX === 'true'
    ? 'wss://ws-api-sandbox.kucoin.com'
    : 'wss://ws-api.kucoin.com',
  testnet: process.env.KUCOIN_SANDBOX === 'true',
  capitalAllocation: 1250, // $5000 / 4 exchanges
  fees: {
    maker: 0.0002, // 0.02%
    taker: 0.0006, // 0.06%
  },
  rateLimits: {
    requests: 30,
    interval: 3000, // 3 seconds
  },
  leverage: {
    max: 100,
    default: 5,
  },
}; 