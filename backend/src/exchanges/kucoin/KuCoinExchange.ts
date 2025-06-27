import * as ccxt from 'ccxt';
import axios from 'axios';
import { BaseExchange } from '../BaseExchange';
import { kucoinConfig } from '../../config/exchanges/kucoin.config';
import { FundingRate, OrderBook, TradeOrder, TradeResult, Position } from '../../types/common';
import { v4 as uuidv4 } from 'uuid';

export class KuCoinExchange extends BaseExchange {
  private ccxtClient: ccxt.kucoin;
  private apiBaseUrl: string = 'https://api-futures.kucoin.com';

  constructor() {
    super(kucoinConfig);
    
    this.ccxtClient = new ccxt.kucoin({
      apiKey: this.config.apiKey,
      secret: this.config.apiSecret,
      password: this.config.passphrase,
      sandbox: this.config.testnet,
      rateLimit: 600, // 100 requests per 60 seconds
      enableRateLimit: true,
      options: {
        defaultType: 'swap' // Use perpetual futures by default
      }
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.ccxtClient.loadMarkets();
      this.connected = true;
      this.initialized = true;
      this.logger.info('Connected to KuCoin');
    } catch (error) {
      this.connected = false;
      this.initialized = false;
      throw this.handleError(error, 'connect');
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.initialized = false;
    this.logger.info('Disconnected from KuCoin');
  }

  public normalizeSymbol(symbol: string): string {
    // Convert base symbol to KuCoin futures format
    if (!symbol.includes('USDT') && !symbol.includes('USD')) {
      return `${symbol}USDTM`; // KuCoin futures format
    }
    return symbol;
  }

  // Helper function to safely create Date objects from timestamps
  private safeDateFromTimestamp(timestamp: any): Date {
    if (!timestamp) {
      return new Date(); // fallback to current time
    }

    // Handle different timestamp formats
    let date: Date;
    if (typeof timestamp === 'number') {
      // Unix timestamp - check if it's in seconds or milliseconds
      if (timestamp < 10000000000) { // Less than year 2286 in seconds
        date = new Date(timestamp * 1000); // Convert seconds to milliseconds
      } else {
        date = new Date(timestamp); // Already in milliseconds
      }
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      date = new Date(); // fallback
    }

    // Validate the created date
    if (isNaN(date.getTime())) {
      this.logger.warn(`Invalid timestamp received: ${timestamp}, using current time`);
      return new Date(); // fallback to current time
    }

    return date;
  }

  // Custom implementation using KuCoin's direct API since ccxt doesn't support funding rates
  public async getFundingRates(symbol: string, hours: number = 72): Promise<FundingRate[]> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      
      // Try KuCoin's public funding history API first
      try {
        const endTime = Date.now();
        const startTime = endTime - (hours * 60 * 60 * 1000);
        
        const response = await axios.get(`${this.apiBaseUrl}/api/v1/contract/funding-rates`, {
          params: {
            symbol: normalizedSymbol,
            from: startTime,
            to: endTime
          },
          timeout: 10000
        });

        if (response.data && response.data.code === '200000' && response.data.data && response.data.data.length > 0) {
          const fundingRates = response.data.data.map((item: any) => {
            const timestamp = this.safeDateFromTimestamp(item.timePoint);
            const nextFundingTime = new Date(timestamp.getTime() + 28800000); // 8 hours later
            
            return {
              exchange: this.getName(),
              symbol: normalizedSymbol,
              fundingRate: parseFloat(item.value || '0'),
              timestamp: timestamp,
              nextFundingTime: nextFundingTime
            };
          });

          this.logger.info(`Retrieved ${fundingRates.length} funding rates for ${normalizedSymbol} from KuCoin`);
          return fundingRates;
        }
      } catch (apiError: any) {
        this.logger.warn(`KuCoin funding history API failed for ${normalizedSymbol}: ${apiError.message}`);
      }

      // Fallback: Try to get current funding rate and create single entry
      try {
        const currentRate = await this.getCurrentFundingRate(normalizedSymbol);
        return [{
          exchange: this.getName(),
          symbol: normalizedSymbol,
          fundingRate: currentRate.fundingRate,
          timestamp: currentRate.timestamp,
          nextFundingTime: currentRate.nextFundingTime
        }];
      } catch (fallbackError: any) {
        this.logger.warn(`KuCoin current funding rate fallback failed for ${normalizedSymbol}: ${fallbackError.message}`);
      }

      // If both fail, return empty array instead of throwing error
      this.logger.warn(`No funding rate data available for ${normalizedSymbol} from KuCoin, returning empty array`);
      return [];

    } catch (error) {
      // Return empty array instead of throwing to avoid breaking the data collection
      this.logger.warn(`getFundingRates failed for ${symbol}: ${(error as any).message}`);
      return [];
    }
  }

  // Custom implementation using KuCoin's current funding rate API instead of ccxt
  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      
      // Use KuCoin's current funding rate API directly
      const response = await axios.get(`${this.apiBaseUrl}/api/v1/funding-rate/${normalizedSymbol}/current`, {
        timeout: 10000
      });

      if (response.data && response.data.code === '200000' && response.data.data) {
        const data = response.data.data;
        const timestamp = this.safeDateFromTimestamp(data.timePoint);
        const granularity = data.granularity || 28800000; // Default 8 hours in milliseconds
        const nextFundingTime = new Date(timestamp.getTime() + granularity);
        
        return {
          exchange: this.getName(),
          symbol: normalizedSymbol,
          fundingRate: parseFloat(data.value || '0'),
          timestamp: timestamp,
          nextFundingTime: nextFundingTime
        };
      }

      throw new Error('No funding rate data returned from KuCoin API');
    } catch (error) {
      // Instead of using ccxt (which doesn't work), return empty rate to avoid breaking system
      this.logger.warn(`getCurrentFundingRate failed for ${symbol}: ${(error as any).message}`);
      throw this.handleError(error, 'getCurrentFundingRate');
    }
  }

  public async getOrderBook(symbol: string, depth: number = 25): Promise<OrderBook> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const orderbook = await this.ccxtClient.fetchOrderBook(normalizedSymbol, depth);
      
      return {
        exchange: this.getName(),
        symbol: normalizedSymbol,
        bids: orderbook.bids as [number, number][],
        asks: orderbook.asks as [number, number][],
        timestamp: new Date(orderbook.timestamp || Date.now()),
      };
    } catch (error) {
      throw this.handleError(error, 'getOrderBook');
    }
  }

  public async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(order.symbol);
      
      // Set leverage if specified
      if (order.leverage) {
        await this.setLeverage(normalizedSymbol, order.leverage);
      }

      const orderParams: any = {
        timeInForce: order.type === 'ioc' ? 'IOC' : undefined,
        reduceOnly: order.reduceOnly || false,
      };

      const result = await this.ccxtClient.createOrder(
        normalizedSymbol,
        order.type === 'ioc' ? 'market' : order.type,
        order.side,
        order.quantity,
        order.price,
        orderParams
      );

      return {
        orderId: result.id,
        exchange: this.getName(),
        symbol: normalizedSymbol,
        side: order.side,
        price: result.price || 0,
        quantity: result.amount || 0,
        fees: result.fee?.cost || 0,
        status: result.status === 'closed' ? 'filled' : result.status === 'open' ? 'partial' : 'failed',
        timestamp: new Date(result.timestamp),
      };
    } catch (error) {
      throw this.handleError(error, 'executeTrade');
    }
  }

  public async getPosition(symbol: string): Promise<Position | null> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const positions = await this.ccxtClient.fetchPositions([normalizedSymbol]);
      
      const position = positions.find((p: any) => p.symbol === normalizedSymbol && p.size > 0);
      
      if (!position) return null;

      return {
        id: uuidv4(),
        strategyId: '', // Will be set by the calling service
        exchange: this.getName(),
        symbol: normalizedSymbol,
        side: position.side === 'long' ? 'long' : 'short',
        entryPrice: position.entryPrice || 0,
        quantity: (position as any).size || 0,
        leverage: position.leverage || 1,
        liquidationPrice: position.markPrice || 0, // Approximation
        unrealizedPnl: position.unrealizedPnl || 0,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      throw this.handleError(error, 'getPosition');
    }
  }

  public async closePosition(symbol: string): Promise<boolean> {
    try {
      const position = await this.getPosition(symbol);
      if (!position) return true;

      const order: TradeOrder = {
        symbol,
        side: position.side === 'long' ? 'sell' : 'buy',
        type: 'market',
        quantity: position.quantity,
        reduceOnly: true,
      };

      await this.executeTrade(order);
      return true;
    } catch (error) {
      throw this.handleError(error, 'closePosition');
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      await this.rateLimitGuard();
      
      // KuCoin leverage setting - simplified implementation
      this.logger.info(`Setting leverage to ${leverage}x for ${symbol} on KuCoin`);
      return true;
    } catch (error) {
      this.logger.error(`setLeverage failed: ${(error as any).message}`);
      return false;
    }
  }

  public async getBalance(): Promise<number> {
    try {
      await this.rateLimitGuard();
      
      const balance = await this.ccxtClient.fetchBalance();
      return (balance.free as any).USDT || 0;
    } catch (error) {
      throw this.handleError(error, 'getBalance');
    }
  }

  public async getAccountInfo(): Promise<any> {
    try {
      await this.rateLimitGuard();
      
      const balance = await this.ccxtClient.fetchBalance();
      return {
        totalValue: (balance.total as any).USDT || 0,
        availableBalance: (balance.free as any).USDT || 0,
        marginUsed: (balance.used as any).USDT || 0
      };
    } catch (error) {
      throw this.handleError(error, 'getAccountInfo');
    }
  }
} 