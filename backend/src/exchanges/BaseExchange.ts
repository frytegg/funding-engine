import { IExchange } from './interfaces/IExchange';
import { IExchangeConfig } from '../config/interfaces/IExchangeConfig';
import { FundingRate, OrderBook, TradeOrder, TradeResult, Position } from '../types/common';
import { Logger } from '../utils/logger';

export abstract class BaseExchange implements IExchange {
  protected config: IExchangeConfig;
  protected logger: Logger;
  protected connected: boolean = false;
  protected lastRequestTime: number = 0;
  protected initialized: boolean = false;

  constructor(config: IExchangeConfig) {
    this.config = config;
    this.logger = new Logger(`Exchange:${config.name}`);
  }

  public getName(): string {
    return this.config.name;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  protected async rateLimitGuard(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = this.config.rateLimits.interval / this.config.rateLimits.requests;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      this.logger.debug(`Rate limit guard: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  protected handleError(error: any, method: string): Error {
    this.logger.error(`${method} error:`, error);
    
    if (error.response?.status === 429) {
      return new Error(`Rate limit exceeded for ${this.getName()}`);
    }
    
    if (error.response?.status >= 500) {
      return new Error(`${this.getName()} server error: ${error.message}`);
    }
    
    return new Error(`${this.getName()} ${method} failed: ${error.message}`);
  }

  public validateSymbol(symbol: string): boolean {
    return !!(symbol && typeof symbol === 'string' && symbol.length > 0);
  }

  // Abstract methods that must be implemented by each exchange
  public abstract getFundingRates(symbol: string, hours?: number): Promise<FundingRate[]>;
  public abstract getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  public abstract getCurrentFundingRate(symbol: string): Promise<FundingRate>;
  public abstract executeTrade(order: TradeOrder): Promise<TradeResult>;
  public abstract getPosition(symbol: string): Promise<Position | null>;
  public abstract closePosition(symbol: string): Promise<boolean>;
  public abstract setLeverage(symbol: string, leverage: number): Promise<boolean>;
  public abstract getBalance(): Promise<number>;
  public abstract getAccountInfo(): Promise<any>;
  public abstract normalizeSymbol(symbol: string): string;
  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;
} 