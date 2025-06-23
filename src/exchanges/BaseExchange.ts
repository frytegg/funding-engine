import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IExchange } from './interfaces/IExchange';
import { ExchangeConfig } from '../types/common';
import { logger } from '../utils/logger';
import { retryWithBackoff, sleep } from '../utils/helpers';

export abstract class BaseExchange implements IExchange {
  protected config: ExchangeConfig;
  protected httpClient: AxiosInstance;
  protected rateLimiter: Map<string, number> = new Map();
  protected isInitialized = false;

  constructor(config: ExchangeConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FundingArbitrageBot/1.0',
      },
    });

    this.setupRateLimiter();
    this.setupInterceptors();
  }

  public getName(): string {
    return this.config.name;
  }

  public async initialize(): Promise<void> {
    try {
      logger.info(`Initializing ${this.config.name} exchange`);
      
      // Test connection
      await this.testConnection();
      
      this.isInitialized = true;
      logger.info(`${this.config.name} exchange initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.config.name} exchange:`, error);
      throw error;
    }
  }

  protected abstract testConnection(): Promise<void>;

  protected setupRateLimiter(): void {
    // Simple rate limiter implementation
    setInterval(() => {
      this.rateLimiter.clear();
    }, this.config.rateLimits.interval);
  }

  protected setupInterceptors(): void {
    // Request interceptor for authentication and rate limiting
    this.httpClient.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        return this.addAuthentication(config);
      },
      (error) => {
        logger.error(`Request interceptor error for ${this.config.name}:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  protected async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.rateLimits.interval;
    
    // Clean old entries
    for (const [timestamp] of this.rateLimiter) {
      if (parseInt(timestamp) < windowStart) {
        this.rateLimiter.delete(timestamp);
      }
    }

    if (this.rateLimiter.size >= this.config.rateLimits.requests) {
      const oldestRequest = Math.min(...Array.from(this.rateLimiter.keys()).map(Number));
      const waitTime = (oldestRequest + this.config.rateLimits.interval) - now;
      
      if (waitTime > 0) {
        logger.warn(`Rate limit reached for ${this.config.name}, waiting ${waitTime}ms`);
        await sleep(waitTime);
      }
    }

    this.rateLimiter.set(now.toString(), now);
  }

  protected abstract addAuthentication(config: any): any;

  protected handleApiError(error: any): void {
    if (error.response) {
      const { status, data } = error.response;
      logger.error(`API error for ${this.config.name}:`, {
        status,
        data,
        url: error.config?.url,
      });

      // Handle specific error codes
      switch (status) {
        case 429:
          logger.warn(`Rate limit exceeded for ${this.config.name}`);
          break;
        case 401:
        case 403:
          logger.error(`Authentication failed for ${this.config.name}`);
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          logger.error(`Server error for ${this.config.name}`);
          break;
      }
    } else if (error.request) {
      logger.error(`Network error for ${this.config.name}:`, error.message);
    } else {
      logger.error(`Unknown error for ${this.config.name}:`, error.message);
    }
  }

  protected async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    customConfig?: AxiosRequestConfig
  ): Promise<T> {
    if (!this.isInitialized) {
      throw new Error(`${this.config.name} exchange not initialized`);
    }

    return retryWithBackoff(async () => {
      const config: AxiosRequestConfig = {
        method,
        url: endpoint,
        ...customConfig,
      };

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await this.httpClient.request<T>(config);
      return response.data;
    });
  }

  public async disconnect(): Promise<void> {
    this.isInitialized = false;
    this.rateLimiter.clear();
    logger.info(`${this.config.name} exchange disconnected`);
  }

  // Abstract methods that must be implemented by concrete classes
  public abstract getFundingRates(symbol: string, hours: number): Promise<any[]>;
  public abstract getCurrentFundingRate(symbol: string): Promise<any>;
  public abstract getOrderBook(symbol: string, depth?: number): Promise<any>;
  public abstract executeTrade(order: any): Promise<any>;
  public abstract getPosition(symbol: string): Promise<any>;
  public abstract getAllPositions(): Promise<any[]>;
  public abstract closePosition(symbol: string, quantity?: number): Promise<boolean>;
  public abstract setLeverage(symbol: string, leverage: number): Promise<boolean>;
  public abstract getBalance(): Promise<any>;
  public abstract getMarginRatio(): Promise<number>;
  public abstract isSymbolSupported(symbol: string): Promise<boolean>;
  public abstract getMinOrderSize(symbol: string): Promise<number>;
  public abstract getTickSize(symbol: string): Promise<number>;
  public abstract cancelAllOrders(symbol: string): Promise<boolean>;
  public abstract getTradingFees(symbol: string): Promise<any>;
  public abstract setMarginMode(symbol: string, isolated: boolean): Promise<boolean>;
} 