import * as ccxt from 'ccxt';
import { BaseExchange } from '../BaseExchange';
import { bitgetConfig } from '../../config/exchanges/bitget.config';
import { FundingRate, OrderBook, TradeOrder, TradeResult, Position } from '../../types/common';
import { v4 as uuidv4 } from 'uuid';

export class BitGetExchange extends BaseExchange {
  private ccxtClient: ccxt.bitget;

  constructor() {
    super(bitgetConfig);
    
    this.ccxtClient = new ccxt.bitget({
      apiKey: this.config.apiKey,
      secret: this.config.apiSecret,
      passphrase: this.config.passphrase,
      sandbox: this.config.testnet,
      enableRateLimit: true,
      options: {
        defaultType: 'swap', // Use perpetual futures
      }
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.ccxtClient.loadMarkets();
      this.connected = true;
      this.initialized = true;
      this.logger.info('Connected to BitGet');
    } catch (error) {
      this.connected = false;
      this.initialized = false;
      throw this.handleError(error, 'connect');
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.initialized = false;
    this.logger.info('Disconnected from BitGet');
  }

  public normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase().replace('/', '');
  }

  public async getFundingRates(symbol: string, hours: number = 72): Promise<FundingRate[]> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      const fundingHistory = await this.ccxtClient.fetchFundingRateHistory(normalizedSymbol, since);
      
      return fundingHistory.map((rate: any) => ({
        exchange: this.getName(),
        symbol: normalizedSymbol,
        fundingRate: rate.fundingRate || 0,
        timestamp: new Date(rate.timestamp),
        nextFundingTime: new Date(rate.timestamp + 8 * 60 * 60 * 1000), // 8 hours later
      }));
    } catch (error) {
      // Log warning but return empty array to avoid breaking the collection
      this.logger.warn(`Failed to get funding rates for ${symbol}: ${(error as any).message}`);
      return [];
    }
  }

  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      await this.rateLimitGuard();
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const fundingRate = await this.ccxtClient.fetchFundingRate(normalizedSymbol);
      
      return {
        exchange: this.getName(),
        symbol: normalizedSymbol,
        fundingRate: fundingRate.fundingRate || 0,
        timestamp: new Date(fundingRate.timestamp || Date.now()),
        nextFundingTime: new Date(fundingRate.fundingDatetime || Date.now()),
      };
    } catch (error) {
      // Log error but still throw it since this is called individually
      this.logger.error(`Failed to get current funding rate for ${symbol}: ${(error as any).message}`);
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
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      await this.ccxtClient.setLeverage(leverage, normalizedSymbol);
      return true;
    } catch (error) {
      throw this.handleError(error, 'setLeverage');
    }
  }

  public async getBalance(): Promise<number> {
    try {
      await this.rateLimitGuard();
      
      const balance = await this.ccxtClient.fetchBalance();
      return balance.USDT?.free || 0;
    } catch (error) {
      throw this.handleError(error, 'getBalance');
    }
  }

  public async getAccountInfo(): Promise<any> {
    try {
      await this.rateLimitGuard();
      
      return await this.ccxtClient.fetchBalance();
    } catch (error) {
      throw this.handleError(error, 'getAccountInfo');
    }
  }
} 