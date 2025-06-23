// @ts-nocheck
import crypto from 'crypto';
import { AxiosRequestConfig } from 'axios';
import { BaseExchange } from '../BaseExchange';
import { kucoinConfig, kucoinEndpoints } from '../../config/exchanges/kucoin.config';
import { 
  FundingRate, 
  OrderBook, 
  TradeOrder, 
  TradeResult, 
  Position,
  OrderBookLevel 
} from '../../types/common';
import { logger } from '../../utils/logger';

export class KucoinExchange extends BaseExchange {
  constructor() {
    super(kucoinConfig);
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.makeRequest('GET', '/api/v1/timestamp');
      logger.info('KuCoin connection test successful');
    } catch (error) {
      logger.error('KuCoin connection test failed:', error);
      throw error;
    }
  }

  protected addAuthentication(config: any): any {
    if (!this.config.apiKey || !this.config.apiSecret || !this.config.passphrase) {
      return config;
    }

    const timestamp = Date.now().toString();
    const method = config.method?.toUpperCase() || 'GET';
    const endpoint = config.url || '';
    
    // Create the message to sign
    let message = timestamp + method + endpoint;
    
    if (config.method === 'POST' && config.data) {
      const body = JSON.stringify(config.data);
      message += body;
    } else if (config.method === 'GET' && config.params) {
      const queryString = new URLSearchParams(config.params).toString();
      if (queryString) {
        message += '?' + queryString;
      }
    }

    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('base64');

    const passphrase = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(this.config.passphrase!)
      .digest('base64');

    config.headers = {
      ...config.headers,
      'KC-API-KEY': this.config.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json',
    };

    return config;
  }

  public async getFundingRates(symbol: string, hours: number): Promise<FundingRate[]> {
    try {
      const endTime = Date.now();
      const startTime = endTime - (hours * 60 * 60 * 1000);

      const response = await this.makeRequest<any>('GET', kucoinEndpoints.fundingRate, {
        symbol,
        from: startTime,
        to: endTime,
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return response.data.map((item: any) => ({
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(item.fundingRate),
        timestamp: new Date(parseInt(item.timePoint)),
        nextFundingTime: new Date(parseInt(item.timePoint) + 8 * 60 * 60 * 1000), // 8 hours
      }));
    } catch (error) {
      logger.error(`Error fetching KuCoin funding rates for ${symbol}:`, error);
      return [];
    }
  }

  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v1/contracts/' + symbol);

      if (!response.data) {
        throw new Error('No funding rate data available');
      }

      const contract = response.data;
      
      return {
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(contract.fundingFeeRate),
        timestamp: new Date(),
        nextFundingTime: new Date(parseInt(contract.nextFundingRateTime)),
      };
    } catch (error) {
      logger.error(`Error fetching current KuCoin funding rate for ${symbol}:`, error);
      throw error;
    }
  }

  public async getOrderBook(symbol: string, depth: number = 25): Promise<OrderBook> {
    try {
      const response = await this.makeRequest<any>('GET', kucoinEndpoints.orderbook, {
        symbol,
        limit: depth,
      });

      if (!response.data) {
        throw new Error('No orderbook data available');
      }

      const result = response.data;
      const bids: OrderBookLevel[] = result.bids.map((bid: string[]) => ({
        price: parseFloat(bid[0]),
        quantity: parseFloat(bid[1]),
      }));

      const asks: OrderBookLevel[] = result.asks.map((ask: string[]) => ({
        price: parseFloat(ask[0]),
        quantity: parseFloat(ask[1]),
      }));

      return {
        exchange: this.config.name,
        symbol,
        bids,
        asks,
        timestamp: new Date(parseInt(result.ts)),
      };
    } catch (error) {
      logger.error(`Error fetching KuCoin orderbook for ${symbol}:`, error);
      throw error;
    }
  }

  public async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      const orderData = {
        symbol: order.symbol,
        side: order.side,
        type: this.mapOrderType(order.orderType),
        size: order.quantity.toString(),
        timeInForce: order.timeInForce || 'IOC',
        reduceOnly: order.reduceOnly || false,
      };

      if (order.price && order.orderType !== 'market') {
        (orderData as any).price = order.price.toString();
      }

      const response = await this.makeRequest<any>('POST', kucoinEndpoints.placeOrder, orderData);

      if (!response.data) {
        throw new Error('Order placement failed');
      }

      // Get order status
      const orderStatus = await this.getOrderStatus(response.data.orderId);
      
      return {
        orderId: response.data.orderId,
        symbol: order.symbol,
        side: order.side,
        quantity: parseFloat(orderStatus.dealSize) || 0,
        price: parseFloat(orderStatus.dealValue) / parseFloat(orderStatus.dealSize) || order.price || 0,
        fees: parseFloat(orderStatus.fee) || 0,
        status: this.mapOrderStatus(orderStatus.status),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error executing KuCoin trade for ${order.symbol}:`, error);
      throw error;
    }
  }

  private async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>('GET', `/api/v1/orders/${orderId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching KuCoin order status for ${orderId}:`, error);
      throw error;
    }
  }

  private mapOrderType(orderType: string): string {
    switch (orderType.toLowerCase()) {
      case 'market':
        return 'market';
      case 'limit':
        return 'limit';
      default:
        return 'limit';
    }
  }

  private mapOrderStatus(status: string): 'filled' | 'partial' | 'cancelled' | 'failed' {
    switch (status?.toLowerCase()) {
      case 'done':
        return 'filled';
      case 'match':
        return 'partial';
      case 'cancel':
        return 'cancelled';
      default:
        return 'failed';
    }
  }

  public async getPosition(symbol: string): Promise<Position | null> {
    try {
      const response = await this.makeRequest<any>('GET', kucoinEndpoints.positions);

      if (!response.data || !Array.isArray(response.data)) {
        return null;
      }

      const position = response.data.find((pos: any) => pos.symbol === symbol);
      
      if (!position || parseFloat(position.currentQty) === 0) {
        return null;
      }

      return {
        exchange: this.config.name,
        symbol,
        side: parseFloat(position.currentQty) > 0 ? 'long' : 'short',
        size: Math.abs(parseFloat(position.currentQty)),
        entryPrice: parseFloat(position.avgEntryPrice),
        markPrice: parseFloat(position.markPrice),
        unrealizedPnl: parseFloat(position.unrealisedPnl),
        realizedPnl: parseFloat(position.realisedPnl),
        leverage: parseFloat(position.realLeverage),
        marginUsed: parseFloat(position.posMaint),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error fetching KuCoin position for ${symbol}:`, error);
      return null;
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      const response = await this.makeRequest<any>('GET', kucoinEndpoints.positions);

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter((pos: any) => parseFloat(pos.currentQty) !== 0)
        .map((pos: any) => ({
          exchange: this.config.name,
          symbol: pos.symbol,
          side: parseFloat(pos.currentQty) > 0 ? 'long' : 'short',
          size: Math.abs(parseFloat(pos.currentQty)),
          entryPrice: parseFloat(pos.avgEntryPrice),
          markPrice: parseFloat(pos.markPrice),
          unrealizedPnl: parseFloat(pos.unrealisedPnl),
          realizedPnl: parseFloat(pos.realisedPnl),
          leverage: parseFloat(pos.realLeverage),
          marginUsed: parseFloat(pos.posMaint),
          timestamp: new Date(),
        }));
    } catch (error) {
      logger.error('Error fetching KuCoin positions:', error);
      return [];
    }
  }

  public async closePosition(symbol: string, quantity?: number): Promise<boolean> {
    try {
      const position = await this.getPosition(symbol);
      if (!position) {
        return true; // No position to close
      }

      const closeSize = quantity || position.size;
      const closeSide = position.side === 'long' ? 'sell' : 'buy';

      const orderData = {
        symbol,
        side: closeSide,
        type: 'market',
        size: closeSize.toString(),
        reduceOnly: true,
      };

      await this.makeRequest<any>('POST', kucoinEndpoints.placeOrder, orderData);
      return true;
    } catch (error) {
      logger.error(`Error closing KuCoin position for ${symbol}:`, error);
      return false;
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      await this.makeRequest<any>('POST', kucoinEndpoints.leverage, {
        symbol,
        leverage,
      });
      return true;
    } catch (error) {
      logger.error(`Error setting KuCoin leverage for ${symbol}:`, error);
      return false;
    }
  }

  public async getBalance(): Promise<{
    totalBalance: number;
    availableBalance: number;
    marginUsed: number;
    unrealizedPnl: number;
  }> {
    try {
      const response = await this.makeRequest<any>('GET', kucoinEndpoints.balance);

      if (!response.data) {
        throw new Error('No balance data available');
      }

      const data = response.data;
      
      return {
        totalBalance: parseFloat(data.accountEquity),
        availableBalance: parseFloat(data.availableBalance),
        marginUsed: parseFloat(data.positionMargin),
        unrealizedPnl: parseFloat(data.unrealisedPNL),
      };
    } catch (error) {
      logger.error('Error fetching KuCoin balance:', error);
      throw error;
    }
  }

  public async getMarginRatio(): Promise<number> {
    try {
      const balance = await this.getBalance();
      if (balance.totalBalance <= 0) return 0;
      
      return balance.marginUsed / balance.totalBalance;
    } catch (error) {
      logger.error('Error calculating KuCoin margin ratio:', error);
      return 0;
    }
  }

  public async isSymbolSupported(symbol: string): Promise<boolean> {
    try {
      const response = await this.makeRequest<any>('GET', kucoinEndpoints.instruments);
      
      if (!response.data || !Array.isArray(response.data)) {
        return false;
      }

      return response.data.some((contract: any) => contract.symbol === symbol);
    } catch (error) {
      logger.error(`Error checking KuCoin symbol support for ${symbol}:`, error);
      return false;
    }
  }

  public async getMinOrderSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('GET', `/api/v1/contracts/${symbol}`);
      
      if (!response.data) {
        return 0.001; // Default fallback
      }

      return parseFloat(response.data.lotSize) || 0.001;
    } catch (error) {
      logger.error(`Error fetching KuCoin min order size for ${symbol}:`, error);
      return 0.001;
    }
  }

  public async getTickSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('GET', `/api/v1/contracts/${symbol}`);
      
      if (!response.data) {
        return 0.01; // Default fallback
      }

      return parseFloat(response.data.tickSize) || 0.01;
    } catch (error) {
      logger.error(`Error fetching KuCoin tick size for ${symbol}:`, error);
      return 0.01;
    }
  }

  public async cancelAllOrders(symbol: string): Promise<boolean> {
    try {
      await this.makeRequest<any>('DELETE', '/api/v1/orders', { symbol });
      return true;
    } catch (error) {
      logger.error(`Error cancelling KuCoin orders for ${symbol}:`, error);
      return false;
    }
  }

  public async getTradingFees(symbol: string): Promise<{
    makerFee: number;
    takerFee: number;
  }> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v1/trade-fees');
      
      if (!response.data) {
        return {
          makerFee: this.config.fees.maker,
          takerFee: this.config.fees.taker,
        };
      }

      return {
        makerFee: parseFloat(response.data.makerFeeRate),
        takerFee: parseFloat(response.data.takerFeeRate),
      };
    } catch (error) {
      logger.error(`Error fetching KuCoin trading fees for ${symbol}:`, error);
      return {
        makerFee: this.config.fees.maker,
        takerFee: this.config.fees.taker,
      };
    }
  }

  public async setMarginMode(symbol: string, isolated: boolean): Promise<boolean> {
    try {
      await this.makeRequest<any>('POST', kucoinEndpoints.marginMode, {
        symbol,
        marginMode: isolated ? 'ISOLATED' : 'CROSSED',
      });
      return true;
    } catch (error) {
      logger.error(`Error setting KuCoin margin mode for ${symbol}:`, error);
      return false;
    }
  }
} 