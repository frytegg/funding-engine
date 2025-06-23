// @ts-nocheck
import crypto from 'crypto';
import { AxiosRequestConfig } from 'axios';
import { BaseExchange } from '../BaseExchange';
import { bybitConfig, bybitEndpoints } from '../../config/exchanges/bybit.config';
import { 
  FundingRate, 
  OrderBook, 
  TradeOrder, 
  TradeResult, 
  Position,
  OrderBookLevel 
} from '../../types/common';
import { logger } from '../../utils/logger';

export class BybitExchange extends BaseExchange {
  constructor() {
    super(bybitConfig);
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.makeRequest('GET', '/v5/market/time');
      logger.info('Bybit connection test successful');
    } catch (error) {
      logger.error('Bybit connection test failed:', error);
      throw error;
    }
  }

  protected addAuthentication(config: any): any {
    if (!this.config.apiKey || !this.config.apiSecret) {
      return config;
    }

    const timestamp = Date.now().toString();
    const recv_window = '20000';
    
    // For GET requests, create query string from params
    let paramStr = '';
    if (config.method === 'GET' && config.params) {
      paramStr = new URLSearchParams(config.params).toString();
    } else if (config.data && typeof config.data === 'object') {
      paramStr = JSON.stringify(config.data);
    }

    const sign = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(timestamp + this.config.apiKey + recv_window + paramStr)
      .digest('hex');

    config.headers = {
      ...config.headers,
      'X-BAPI-API-KEY': this.config.apiKey,
      'X-BAPI-SIGN': sign,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recv_window,
    };

    return config;
  }

  public async getFundingRates(symbol: string, hours: number): Promise<FundingRate[]> {
    try {
      const endTime = Date.now();
      const startTime = endTime - (hours * 60 * 60 * 1000);

      const response = await this.makeRequest<any>('GET', bybitEndpoints.fundingRate, {
        category: 'linear',
        symbol,
        startTime,
        endTime,
        limit: 200,
      });

      if (!response.result || !response.result.list) {
        return [];
      }

      return response.result.list.map((item: any) => ({
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(item.fundingRate),
        timestamp: new Date(parseInt(item.fundingRateTimestamp)),
        nextFundingTime: new Date(parseInt(item.fundingRateTimestamp) + 8 * 60 * 60 * 1000), // 8 hours
      }));
    } catch (error) {
      logger.error(`Error fetching Bybit funding rates for ${symbol}:`, error);
      return [];
    }
  }

  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      const response = await this.makeRequest<any>('GET', '/v5/market/tickers', {
        category: 'linear',
        symbol,
      });

      if (!response.result || !response.result.list || response.result.list.length === 0) {
        throw new Error('No funding rate data available');
      }

      const ticker = response.result.list[0];
      
      return {
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(ticker.fundingRate),
        timestamp: new Date(),
        nextFundingTime: new Date(parseInt(ticker.nextFundingTime)),
      };
    } catch (error) {
      logger.error(`Error fetching current Bybit funding rate for ${symbol}:`, error);
      throw error;
    }
  }

  public async getOrderBook(symbol: string, depth: number = 25): Promise<OrderBook> {
    try {
      const response = await this.makeRequest<any>('GET', bybitEndpoints.orderbook, {
        category: 'linear',
        symbol,
        limit: depth,
      });

      if (!response.result) {
        throw new Error('No orderbook data available');
      }

      const result = response.result;
      const bids: OrderBookLevel[] = result.b.map((bid: string[]) => ({
        price: parseFloat(bid[0]),
        quantity: parseFloat(bid[1]),
      }));

      const asks: OrderBookLevel[] = result.a.map((ask: string[]) => ({
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
      logger.error(`Error fetching Bybit orderbook for ${symbol}:`, error);
      throw error;
    }
  }

  public async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      const orderData = {
        category: 'linear',
        symbol: order.symbol,
        side: order.side === 'buy' ? 'Buy' : 'Sell',
        orderType: this.mapOrderType(order.orderType),
        qty: order.quantity.toString(),
        timeInForce: order.timeInForce || 'IOC',
        reduceOnly: order.reduceOnly || false,
      };

      if (order.price && order.orderType !== 'market') {
        (orderData as any).price = order.price.toString();
      }

      const response = await this.makeRequest<any>('POST', bybitEndpoints.placeOrder, orderData);

      if (!response.result) {
        throw new Error('Order placement failed');
      }

      // Get order status
      const orderStatus = await this.getOrderStatus(response.result.orderId);
      
      return {
        orderId: response.result.orderId,
        symbol: order.symbol,
        side: order.side,
        quantity: orderStatus.cumExecQty || 0,
        price: orderStatus.avgPrice || order.price || 0,
        fees: orderStatus.cumExecFee || 0,
        status: this.mapOrderStatus(orderStatus.orderStatus),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error executing Bybit trade for ${order.symbol}:`, error);
      throw error;
    }
  }

  private async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>('GET', '/v5/order/realtime', {
        category: 'linear',
        orderId,
      });

      if (!response.result || !response.result.list || response.result.list.length === 0) {
        throw new Error('Order not found');
      }

      return response.result.list[0];
    } catch (error) {
      logger.error(`Error fetching Bybit order status for ${orderId}:`, error);
      throw error;
    }
  }

  private mapOrderType(orderType: string): string {
    switch (orderType) {
      case 'market':
        return 'Market';
      case 'limit':
        return 'Limit';
      case 'IOC':
        return 'Limit';
      case 'FOK':
        return 'Limit';
      default:
        return 'Limit';
    }
  }

  private mapOrderStatus(status: string): 'filled' | 'partial' | 'cancelled' | 'failed' {
    switch (status) {
      case 'Filled':
        return 'filled';
      case 'PartiallyFilled':
        return 'partial';
      case 'Cancelled':
      case 'Rejected':
        return 'cancelled';
      default:
        return 'failed';
    }
  }

  public async getPosition(symbol: string): Promise<Position | null> {
    try {
      const response = await this.makeRequest('GET', bybitEndpoints.positions, {
        category: 'linear',
        symbol,
      });

      if (!response.result || !response.result.list || response.result.list.length === 0) {
        return null;
      }

      const position = response.result.list[0];
      
      if (parseFloat(position.size) === 0) {
        return null;
      }

      return {
        exchange: this.config.name,
        symbol,
        side: position.side === 'Buy' ? 'long' : 'short',
        size: parseFloat(position.size),
        entryPrice: parseFloat(position.avgPrice),
        markPrice: parseFloat(position.markPrice),
        leverage: parseInt(position.leverage),
        unrealizedPnl: parseFloat(position.unrealisedPnl),
        liquidationPrice: parseFloat(position.liqPrice),
        margin: parseFloat(position.positionIM),
        marginRatio: parseFloat(position.positionMM) / parseFloat(position.positionValue),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error fetching Bybit position for ${symbol}:`, error);
      return null;
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      const response = await this.makeRequest('GET', bybitEndpoints.positions, {
        category: 'linear',
        settleCoin: 'USDT',
      });

      if (!response.result || !response.result.list) {
        return [];
      }

      return response.result.list
        .filter((pos: any) => parseFloat(pos.size) > 0)
        .map((position: any) => ({
          exchange: this.config.name,
          symbol: position.symbol,
          side: position.side === 'Buy' ? 'long' : 'short',
          size: parseFloat(position.size),
          entryPrice: parseFloat(position.avgPrice),
          markPrice: parseFloat(position.markPrice),
          leverage: parseInt(position.leverage),
          unrealizedPnl: parseFloat(position.unrealisedPnl),
          liquidationPrice: parseFloat(position.liqPrice),
          margin: parseFloat(position.positionIM),
          marginRatio: parseFloat(position.positionMM) / parseFloat(position.positionValue),
          timestamp: new Date(),
        }));
    } catch (error) {
      logger.error('Error fetching Bybit positions:', error);
      return [];
    }
  }

  public async closePosition(symbol: string, quantity?: number): Promise<boolean> {
    try {
      const position = await this.getPosition(symbol);
      if (!position) {
        return true; // No position to close
      }

      const closeQuantity = quantity || position.size;
      const closeSide = position.side === 'long' ? 'sell' : 'buy';

      const orderResult = await this.executeTrade({
        symbol,
        side: closeSide,
        quantity: closeQuantity,
        orderType: 'market',
        reduceOnly: true,
      });

      return orderResult.status === 'filled';
    } catch (error) {
      logger.error(`Error closing Bybit position for ${symbol}:`, error);
      return false;
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      await this.makeRequest('POST', bybitEndpoints.leverage, {
        category: 'linear',
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString(),
      });

      return true;
    } catch (error) {
      logger.error(`Error setting Bybit leverage for ${symbol}:`, error);
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
      const response = await this.makeRequest<any>('GET', bybitEndpoints.balance, {
        accountType: 'UNIFIED',
        coin: 'USDT',
      });

      if (!response.result || !response.result.list || response.result.list.length === 0) {
        throw new Error('No balance data available');
      }

      const account = response.result.list[0];
      const usdtCoin = account.coin.find((c: any) => c.coin === 'USDT');

      if (!usdtCoin) {
        throw new Error('USDT balance not found');
      }

      return {
        totalBalance: parseFloat(usdtCoin.walletBalance),
        availableBalance: parseFloat(usdtCoin.availableToWithdraw),
        marginUsed: parseFloat(account.totalMarginBalance),
        unrealizedPnl: parseFloat(account.totalPerpUPL),
      };
    } catch (error) {
      logger.error('Error fetching Bybit balance:', error);
      throw error;
    }
  }

  public async getMarginRatio(): Promise<number> {
    try {
      const balance = await this.getBalance();
      if (balance.totalBalance === 0) return 0;
      return balance.marginUsed / balance.totalBalance;
    } catch (error) {
      logger.error('Error calculating Bybit margin ratio:', error);
      return 0;
    }
  }

  public async isSymbolSupported(symbol: string): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', bybitEndpoints.instruments, {
        category: 'linear',
        symbol,
      });

      return !!(response.result && response.result.list && response.result.list.length > 0);
    } catch (error) {
      logger.error(`Error checking Bybit symbol support for ${symbol}:`, error);
      return false;
    }
  }

  public async getMinOrderSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest('GET', bybitEndpoints.instruments, {
        category: 'linear',
        symbol,
      });

      if (!response.result || !response.result.list || response.result.list.length === 0) {
        throw new Error('Symbol not found');
      }

      const instrument = response.result.list[0];
      return parseFloat(instrument.lotSizeFilter.minOrderQty);
    } catch (error) {
      logger.error(`Error fetching Bybit min order size for ${symbol}:`, error);
      return 0;
    }
  }

  public async getTickSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest('GET', bybitEndpoints.instruments, {
        category: 'linear',
        symbol,
      });

      if (!response.result || !response.result.list || response.result.list.length === 0) {
        throw new Error('Symbol not found');
      }

      const instrument = response.result.list[0];
      return parseFloat(instrument.priceFilter.tickSize);
    } catch (error) {
      logger.error(`Error fetching Bybit tick size for ${symbol}:`, error);
      return 0;
    }
  }

  public async cancelAllOrders(symbol: string): Promise<boolean> {
    try {
      await this.makeRequest('POST', '/v5/order/cancel-all', {
        category: 'linear',
        symbol,
      });

      return true;
    } catch (error) {
      logger.error(`Error cancelling Bybit orders for ${symbol}:`, error);
      return false;
    }
  }

  public async getTradingFees(symbol: string): Promise<{
    makerFee: number;
    takerFee: number;
  }> {
    // Bybit fees are usually static, but we could fetch from API if needed
    return {
      makerFee: this.config.fees.maker,
      takerFee: this.config.fees.taker,
    };
  }

  public async setMarginMode(symbol: string, isolated: boolean): Promise<boolean> {
    try {
      await this.makeRequest('POST', bybitEndpoints.marginMode, {
        category: 'linear',
        symbol,
        tradeMode: isolated ? 1 : 0, // 0: cross margin, 1: isolated margin
        buyLeverage: this.config.leverage.default.toString(),
        sellLeverage: this.config.leverage.default.toString(),
      });

      return true;
    } catch (error) {
      logger.error(`Error setting Bybit margin mode for ${symbol}:`, error);
      return false;
    }
  }
} 