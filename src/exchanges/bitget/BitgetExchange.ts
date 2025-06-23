import crypto from 'crypto';
import { BaseExchange } from '../BaseExchange';
import { bitgetConfig, bitgetEndpoints } from '../../config/exchanges/bitget.config';
import { 
  FundingRate, 
  OrderBook, 
  TradeOrder, 
  TradeResult, 
  Position,
  OrderBookLevel 
} from '../../types/common';
import { logger } from '../../utils/logger';

export class BitgetExchange extends BaseExchange {
  constructor() {
    super(bitgetConfig);
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.makeRequest('GET', '/api/v2/public/time');
      logger.info('Bitget connection test successful');
    } catch (error) {
      logger.error('Bitget connection test failed:', error);
      throw error;
    }
  }

  protected addAuthentication(config: any): any {
    if (!this.config.apiKey || !this.config.apiSecret || !this.config.passphrase) {
      return config;
    }

    const timestamp = Date.now().toString();
    let requestPath = config.url.replace(this.config.baseUrl, '');
    
    let body = '';
    if (config.method === 'GET' && config.params) {
      const queryString = new URLSearchParams(config.params).toString();
      if (queryString) {
        requestPath += '?' + queryString;
      }
    } else if (config.data) {
      body = JSON.stringify(config.data);
    }

    const message = timestamp + config.method.toUpperCase() + requestPath + body;
    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('base64');

    config.headers = {
      ...config.headers,
      'ACCESS-KEY': this.config.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': this.config.passphrase,
      'Content-Type': 'application/json',
    };

    return config;
  }

  public async getFundingRates(symbol: string, hours: number): Promise<FundingRate[]> {
    try {
      const endTime = Date.now();
      const startTime = endTime - (hours * 60 * 60 * 1000);

      const response = await this.makeRequest<any>('GET', bitgetEndpoints.fundingRate, {
        symbol,
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        limit: '100',
      });

      if (!response.data) {
        return [];
      }

      return response.data.map((item: any) => ({
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(item.fundingRate),
        timestamp: new Date(parseInt(item.fundingTime)),
        nextFundingTime: new Date(parseInt(item.fundingTime) + 8 * 60 * 60 * 1000),
      }));
    } catch (error) {
      logger.error(`Error fetching Bitget funding rates for ${symbol}:`, error);
      return [];
    }
  }

  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/market/ticker', {
        symbol,
        productType: 'USDT-FUTURES',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No funding rate data available');
      }

      const ticker = response.data[0];
      
      return {
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(ticker.fundingRate),
        timestamp: new Date(),
        nextFundingTime: new Date(parseInt(ticker.nextFundingTime)),
      };
    } catch (error) {
      logger.error(`Error fetching current Bitget funding rate for ${symbol}:`, error);
      throw error;
    }
  }

  public async getOrderBook(symbol: string, depth: number = 25): Promise<OrderBook> {
    try {
      const response = await this.makeRequest<any>('GET', bitgetEndpoints.orderbook, {
        symbol,
        limit: depth.toString(),
      });

      if (!response.data) {
        throw new Error('No orderbook data available');
      }

      const data = response.data;
      const bids: OrderBookLevel[] = data.bids.map((bid: string[]) => ({
        price: parseFloat(bid[0]),
        quantity: parseFloat(bid[1]),
      }));

      const asks: OrderBookLevel[] = data.asks.map((ask: string[]) => ({
        price: parseFloat(ask[0]),
        quantity: parseFloat(ask[1]),
      }));

      return {
        exchange: this.config.name,
        symbol,
        bids,
        asks,
        timestamp: new Date(parseInt(data.ts)),
      };
    } catch (error) {
      logger.error(`Error fetching Bitget orderbook for ${symbol}:`, error);
      throw error;
    }
  }

  public async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      const orderData = {
        symbol: order.symbol,
        productType: 'USDT-FUTURES',
        marginMode: 'isolated',
        marginCoin: 'USDT',
        size: order.quantity.toString(),
        side: order.side,
        orderType: this.mapOrderType(order.orderType),
        timeInForceValue: order.timeInForce || 'IOC',
        reduceOnly: order.reduceOnly || false,
      };

      if (order.price && order.orderType !== 'market') {
        (orderData as any).price = order.price.toString();
      }

      const response = await this.makeRequest<any>('POST', bitgetEndpoints.placeOrder, orderData);

      if (!response.data) {
        throw new Error('Order placement failed');
      }

      // Get order status
      const orderStatus = await this.getOrderStatus(response.data.orderId);
      
      return {
        orderId: response.data.orderId,
        symbol: order.symbol,
        side: order.side,
        quantity: parseFloat(orderStatus.baseVolume || '0'),
        price: parseFloat(orderStatus.priceAvg || order.price?.toString() || '0'),
        fees: parseFloat(orderStatus.fee || '0'),
        status: this.mapOrderStatus(orderStatus.state),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error executing Bitget trade for ${order.symbol}:`, error);
      throw error;
    }
  }

  private async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/order/detail', {
        symbol: 'BTCUSDT', // Would need to pass symbol
        orderId,
      });

      return response.data;
    } catch (error) {
      logger.error(`Error fetching Bitget order status:`, error);
      throw error;
    }
  }

  private mapOrderType(orderType: string): string {
    const mapping: { [key: string]: string } = {
      'market': 'market',
      'limit': 'limit',
      'IOC': 'ioc',
      'FOK': 'fok',
    };
    return mapping[orderType] || 'market';
  }

  private mapOrderStatus(status: string): 'filled' | 'partial' | 'cancelled' | 'failed' {
    const mapping: { [key: string]: 'filled' | 'partial' | 'cancelled' | 'failed' } = {
      'filled': 'filled',
      'partially_filled': 'partial',
      'cancelled': 'cancelled',
      'rejected': 'failed',
    };
    return mapping[status] || 'failed';
  }

  public async getPosition(symbol: string): Promise<Position | null> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/position/single-position', {
        symbol,
        productType: 'USDT-FUTURES',
        marginCoin: 'USDT',
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const pos = response.data[0];
      if (parseFloat(pos.size) === 0) {
        return null;
      }

      return {
        exchange: this.config.name,
        symbol,
        side: pos.side === 'long' ? 'long' : 'short',
        size: parseFloat(pos.size),
        entryPrice: parseFloat(pos.averageOpenPrice),
        markPrice: parseFloat(pos.markPrice),
        leverage: parseInt(pos.leverage),
        unrealizedPnl: parseFloat(pos.unrealizedPL),
        liquidationPrice: parseFloat(pos.liquidationPrice),
        margin: parseFloat(pos.margin),
        marginRatio: parseFloat(pos.marginRatio),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error fetching Bitget position for ${symbol}:`, error);
      return null;
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/position/all-position', {
        productType: 'USDT-FUTURES',
        marginCoin: 'USDT',
      });

      if (!response.data) {
        return [];
      }

      return response.data
        .filter((pos: any) => parseFloat(pos.size) > 0)
        .map((pos: any) => ({
          exchange: this.config.name,
          symbol: pos.symbol,
          side: pos.side === 'long' ? 'long' : 'short',
          size: parseFloat(pos.size),
          entryPrice: parseFloat(pos.averageOpenPrice),
          markPrice: parseFloat(pos.markPrice),
          leverage: parseInt(pos.leverage),
          unrealizedPnl: parseFloat(pos.unrealizedPL),
          liquidationPrice: parseFloat(pos.liquidationPrice),
          margin: parseFloat(pos.margin),
          marginRatio: parseFloat(pos.marginRatio),
          timestamp: new Date(),
        }));
    } catch (error) {
      logger.error('Error fetching Bitget positions:', error);
      return [];
    }
  }

  public async closePosition(symbol: string, quantity?: number): Promise<boolean> {
    try {
      const position = await this.getPosition(symbol);
      if (!position) {
        return true; // Already closed
      }

      const closeSize = quantity || position.size;
      const closeSide = position.side === 'long' ? 'sell' : 'buy';

      const order: TradeOrder = {
        symbol,
        side: closeSide,
        quantity: closeSize,
        orderType: 'market',
        reduceOnly: true,
      };

      await this.executeTrade(order);
      return true;
    } catch (error) {
      logger.error(`Error closing Bitget position for ${symbol}:`, error);
      return false;
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      await this.makeRequest<any>('POST', '/api/v2/mix/account/set-leverage', {
        symbol,
        productType: 'USDT-FUTURES',
        marginCoin: 'USDT',
        leverage: leverage.toString(),
        holdSide: 'long',
      });

      await this.makeRequest<any>('POST', '/api/v2/mix/account/set-leverage', {
        symbol,
        productType: 'USDT-FUTURES',
        marginCoin: 'USDT',
        leverage: leverage.toString(),
        holdSide: 'short',
      });

      return true;
    } catch (error) {
      logger.error(`Error setting Bitget leverage for ${symbol}:`, error);
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
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/account/account', {
        productType: 'USDT-FUTURES',
      });

      if (!response.data) {
        throw new Error('No balance data available');
      }

      const account = response.data;
      
      return {
        totalBalance: parseFloat(account.usdtEquity),
        availableBalance: parseFloat(account.available),
        marginUsed: parseFloat(account.locked),
        unrealizedPnl: parseFloat(account.unrealizedPL),
      };
    } catch (error) {
      logger.error('Error fetching Bitget balance:', error);
      throw error;
    }
  }

  public async getMarginRatio(): Promise<number> {
    try {
      const balance = await this.getBalance();
      return balance.marginUsed / balance.totalBalance;
    } catch (error) {
      logger.error('Error calculating Bitget margin ratio:', error);
      return 0;
    }
  }

  public async isSymbolSupported(symbol: string): Promise<boolean> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/market/contracts', {
        productType: 'USDT-FUTURES',
      });

      if (!response.data) {
        return false;
      }

      return response.data.some((contract: any) => contract.symbol === symbol);
    } catch (error) {
      logger.error(`Error checking Bitget symbol support for ${symbol}:`, error);
      return false;
    }
  }

  public async getMinOrderSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/market/contracts', {
        productType: 'USDT-FUTURES',
      });

      if (!response.data) {
        return 0.001;
      }

      const contract = response.data.find((c: any) => c.symbol === symbol);
      return contract ? parseFloat(contract.minTradeNum) : 0.001;
    } catch (error) {
      logger.error(`Error fetching Bitget min order size for ${symbol}:`, error);
      return 0.001;
    }
  }

  public async getTickSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('GET', '/api/v2/mix/market/contracts', {
        productType: 'USDT-FUTURES',
      });

      if (!response.data) {
        return 0.01;
      }

      const contract = response.data.find((c: any) => c.symbol === symbol);
      return contract ? parseFloat(contract.pricePlace) : 0.01;
    } catch (error) {
      logger.error(`Error fetching Bitget tick size for ${symbol}:`, error);
      return 0.01;
    }
  }

  public async cancelAllOrders(symbol: string): Promise<boolean> {
    try {
      await this.makeRequest<any>('POST', '/api/v2/mix/order/cancel-all-orders', {
        symbol,
        productType: 'USDT-FUTURES',
      });
      return true;
    } catch (error) {
      logger.error(`Error cancelling Bitget orders for ${symbol}:`, error);
      return false;
    }
  }

  public async getTradingFees(symbol: string): Promise<{
    makerFee: number;
    takerFee: number;
  }> {
    return {
      makerFee: this.config.fees.maker,
      takerFee: this.config.fees.taker,
    };
  }

  public async setMarginMode(symbol: string, isolated: boolean): Promise<boolean> {
    try {
      await this.makeRequest<any>('POST', '/api/v2/mix/account/set-margin-mode', {
        symbol,
        productType: 'USDT-FUTURES',
        marginCoin: 'USDT',
        marginMode: isolated ? 'isolated' : 'crossed',
      });
      return true;
    } catch (error) {
      logger.error(`Error setting Bitget margin mode for ${symbol}:`, error);
      return false;
    }
  }
} 