// @ts-nocheck
import crypto from 'crypto';
import { ethers } from 'ethers';
import { AxiosRequestConfig } from 'axios';
import { BaseExchange } from '../BaseExchange';
import { hyperliquidConfig, hyperliquidEndpoints } from '../../config/exchanges/hyperliquid.config';
import { 
  FundingRate, 
  OrderBook, 
  TradeOrder, 
  TradeResult, 
  Position,
  OrderBookLevel 
} from '../../types/common';
import { logger } from '../../utils/logger';

export class HyperliquidExchange extends BaseExchange {
  private wallet?: ethers.Wallet;

  constructor() {
    super(hyperliquidConfig);
    if (this.config.apiKey) {
      try {
        this.wallet = new ethers.Wallet(this.config.apiKey);
      } catch (error) {
        logger.error('Invalid Hyperliquid private key:', error);
      }
    }
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.makeRequest('POST', hyperliquidEndpoints.info, {
        type: 'meta',
      });
      logger.info('Hyperliquid connection test successful');
    } catch (error) {
      logger.error('Hyperliquid connection test failed:', error);
      throw error;
    }
  }

  protected addAuthentication(config: any): any {
    if (!this.wallet) {
      return config;
    }

    // Hyperliquid uses wallet signing for authentication
    if (config.data && config.data.signature) {
      // For signed requests, the signature is already included
      return config;
    }

    config.headers = {
      ...config.headers,
      'Content-Type': 'application/json',
    };

    return config;
  }

  private async signAction(action: any): Promise<any> {
    if (!this.wallet) {
      throw new Error('No wallet configured for signing');
    }

    const timestamp = Date.now();
    const message = JSON.stringify({
      ...action,
      timestamp,
    });

    const signature = await this.wallet.signMessage(message);
    
    return {
      action,
      nonce: timestamp,
      signature,
    };
  }

  public async getFundingRates(symbol: string, hours: number): Promise<FundingRate[]> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'fundingHistory',
        coin: symbol,
      });

      if (!response || !Array.isArray(response)) {
        return [];
      }

      const endTime = Date.now();
      const startTime = endTime - (hours * 60 * 60 * 1000);

      return response
        .filter((item: any) => new Date(item.time).getTime() >= startTime)
        .map((item: any) => ({
          exchange: this.config.name,
          symbol,
          fundingRate: parseFloat(item.fundingRate),
          timestamp: new Date(item.time),
          nextFundingTime: new Date(new Date(item.time).getTime() + 8 * 60 * 60 * 1000), // 8 hours
        }));
    } catch (error) {
      logger.error(`Error fetching Hyperliquid funding rates for ${symbol}:`, error);
      return [];
    }
  }

  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'meta',
      });

      if (!response || !response.universe) {
        throw new Error('No funding rate data available');
      }

      const assetInfo = response.universe.find((asset: any) => asset.name === symbol);
      if (!assetInfo) {
        throw new Error(`Symbol ${symbol} not found`);
      }

      return {
        exchange: this.config.name,
        symbol,
        fundingRate: parseFloat(assetInfo.funding),
        timestamp: new Date(),
        nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
      };
    } catch (error) {
      logger.error(`Error fetching current Hyperliquid funding rate for ${symbol}:`, error);
      throw error;
    }
  }

  public async getOrderBook(symbol: string, depth: number = 25): Promise<OrderBook> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'l2Book',
        coin: symbol,
      });

      if (!response || !response.levels) {
        throw new Error('No orderbook data available');
      }

      const bids: OrderBookLevel[] = response.levels[0]
        .slice(0, depth)
        .map((bid: any) => ({
          price: parseFloat(bid.px),
          quantity: parseFloat(bid.sz),
        }));

      const asks: OrderBookLevel[] = response.levels[1]
        .slice(0, depth)
        .map((ask: any) => ({
          price: parseFloat(ask.px),
          quantity: parseFloat(ask.sz),
        }));

      return {
        exchange: this.config.name,
        symbol,
        bids,
        asks,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error fetching Hyperliquid orderbook for ${symbol}:`, error);
      throw error;
    }
  }

  public async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      const action = {
        type: 'order',
        orders: [{
          a: await this.getAssetIndex(order.symbol),
          b: order.side === 'buy',
          p: order.price?.toString() || '0',
          s: order.quantity.toString(),
          r: order.reduceOnly || false,
          t: this.mapOrderType(order.orderType),
        }],
        grouping: 'na',
      };

      const signedAction = await this.signAction(action);
      
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.exchange, signedAction);

      if (!response || !response.response || !response.response.data) {
        throw new Error('Order placement failed');
      }

      const result = response.response.data.statuses[0];
      
      return {
        orderId: result.resting?.oid || 'market_order',
        symbol: order.symbol,
        side: order.side,
        quantity: parseFloat(result.filled?.totalSz || '0'),
        price: parseFloat(result.filled?.avgPx || order.price?.toString() || '0'),
        fees: parseFloat(result.filled?.fee || '0'),
        status: result.filled ? 'filled' : 'partial',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error executing Hyperliquid trade for ${order.symbol}:`, error);
      throw error;
    }
  }

  private async getAssetIndex(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'meta',
      });

      if (!response || !response.universe) {
        throw new Error('No asset data available');
      }

      const assetInfo = response.universe.find((asset: any) => asset.name === symbol);
      if (!assetInfo) {
        throw new Error(`Symbol ${symbol} not found`);
      }

      return assetInfo.szDecimals;
    } catch (error) {
      logger.error(`Error getting asset index for ${symbol}:`, error);
      return 0;
    }
  }

  private mapOrderType(orderType: string): { limit: { tif: string } } | { trigger: { triggerPx: string; isMarket: boolean; tpsl: string } } {
    switch (orderType.toLowerCase()) {
      case 'market':
        return { limit: { tif: 'Ioc' } };
      case 'limit':
        return { limit: { tif: 'Gtc' } };
      default:
        return { limit: { tif: 'Ioc' } };
    }
  }

  public async getPosition(symbol: string): Promise<Position | null> {
    try {
      if (!this.wallet) {
        throw new Error('No wallet configured');
      }

      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'clearinghouseState',
        user: this.wallet.address,
      });

      if (!response || !response.assetPositions) {
        return null;
      }

      const position = response.assetPositions.find((pos: any) => pos.position.coin === symbol);
      
      if (!position || parseFloat(position.position.szi) === 0) {
        return null;
      }

      const size = Math.abs(parseFloat(position.position.szi));
      const side = parseFloat(position.position.szi) > 0 ? 'long' : 'short';

      return {
        exchange: this.config.name,
        symbol,
        side,
        size,
        entryPrice: parseFloat(position.position.entryPx || '0'),
        markPrice: parseFloat(position.position.positionValue) / size,
        unrealizedPnl: parseFloat(position.position.unrealizedPnl || '0'),
        realizedPnl: parseFloat(position.position.realizedPnl || '0'),
        leverage: parseFloat(position.position.leverage || '1'),
        marginUsed: parseFloat(position.position.marginUsed || '0'),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error fetching Hyperliquid position for ${symbol}:`, error);
      return null;
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      if (!this.wallet) {
        throw new Error('No wallet configured');
      }

      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'clearinghouseState',
        user: this.wallet.address,
      });

      if (!response || !response.assetPositions) {
        return [];
      }

      return response.assetPositions
        .filter((pos: any) => parseFloat(pos.position.szi) !== 0)
        .map((pos: any) => {
          const size = Math.abs(parseFloat(pos.position.szi));
          const side = parseFloat(pos.position.szi) > 0 ? 'long' : 'short';

          return {
            exchange: this.config.name,
            symbol: pos.position.coin,
            side,
            size,
            entryPrice: parseFloat(pos.position.entryPx || '0'),
            markPrice: parseFloat(pos.position.positionValue) / size,
            unrealizedPnl: parseFloat(pos.position.unrealizedPnl || '0'),
            realizedPnl: parseFloat(pos.position.realizedPnl || '0'),
            leverage: parseFloat(pos.position.leverage || '1'),
            marginUsed: parseFloat(pos.position.marginUsed || '0'),
            timestamp: new Date(),
          };
        });
    } catch (error) {
      logger.error('Error fetching Hyperliquid positions:', error);
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

      const action = {
        type: 'order',
        orders: [{
          a: await this.getAssetIndex(symbol),
          b: closeSide === 'buy',
          p: '0', // Market order
          s: closeSize.toString(),
          r: true, // Reduce only
          t: { limit: { tif: 'Ioc' } },
        }],
        grouping: 'na',
      };

      const signedAction = await this.signAction(action);
      await this.makeRequest<any>('POST', hyperliquidEndpoints.exchange, signedAction);
      return true;
    } catch (error) {
      logger.error(`Error closing Hyperliquid position for ${symbol}:`, error);
      return false;
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      const action = {
        type: 'updateLeverage',
        asset: await this.getAssetIndex(symbol),
        isCross: false,
        leverage,
      };

      const signedAction = await this.signAction(action);
      await this.makeRequest<any>('POST', hyperliquidEndpoints.exchange, signedAction);
      return true;
    } catch (error) {
      logger.error(`Error setting Hyperliquid leverage for ${symbol}:`, error);
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
      if (!this.wallet) {
        throw new Error('No wallet configured');
      }

      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'clearinghouseState',
        user: this.wallet.address,
      });

      if (!response) {
        throw new Error('No balance data available');
      }

      const marginSummary = response.marginSummary;
      
      return {
        totalBalance: parseFloat(marginSummary.accountValue || '0'),
        availableBalance: parseFloat(marginSummary.totalMarginUsed || '0'),
        marginUsed: parseFloat(marginSummary.totalMarginUsed || '0'),
        unrealizedPnl: parseFloat(marginSummary.totalNtlPos || '0'),
      };
    } catch (error) {
      logger.error('Error fetching Hyperliquid balance:', error);
      throw error;
    }
  }

  public async getMarginRatio(): Promise<number> {
    try {
      const balance = await this.getBalance();
      if (balance.totalBalance <= 0) return 0;
      
      return balance.marginUsed / balance.totalBalance;
    } catch (error) {
      logger.error('Error calculating Hyperliquid margin ratio:', error);
      return 0;
    }
  }

  public async isSymbolSupported(symbol: string): Promise<boolean> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'meta',
      });
      
      if (!response || !response.universe) {
        return false;
      }

      return response.universe.some((asset: any) => asset.name === symbol);
    } catch (error) {
      logger.error(`Error checking Hyperliquid symbol support for ${symbol}:`, error);
      return false;
    }
  }

  public async getMinOrderSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'meta',
      });
      
      if (!response || !response.universe) {
        return 0.001; // Default fallback
      }

      const assetInfo = response.universe.find((asset: any) => asset.name === symbol);
      if (!assetInfo) {
        return 0.001;
      }

      return Math.pow(10, -assetInfo.szDecimals);
    } catch (error) {
      logger.error(`Error fetching Hyperliquid min order size for ${symbol}:`, error);
      return 0.001;
    }
  }

  public async getTickSize(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest<any>('POST', hyperliquidEndpoints.info, {
        type: 'meta',
      });
      
      if (!response || !response.universe) {
        return 0.01; // Default fallback
      }

      const assetInfo = response.universe.find((asset: any) => asset.name === symbol);
      if (!assetInfo) {
        return 0.01;
      }

      return Math.pow(10, -assetInfo.szDecimals);
    } catch (error) {
      logger.error(`Error fetching Hyperliquid tick size for ${symbol}:`, error);
      return 0.01;
    }
  }

  public async cancelAllOrders(symbol: string): Promise<boolean> {
    try {
      const action = {
        type: 'cancelByCloid',
        cancels: [{
          asset: await this.getAssetIndex(symbol),
          cloid: 'all',
        }],
      };

      const signedAction = await this.signAction(action);
      await this.makeRequest<any>('POST', hyperliquidEndpoints.exchange, signedAction);
      return true;
    } catch (error) {
      logger.error(`Error cancelling Hyperliquid orders for ${symbol}:`, error);
      return false;
    }
  }

  public async getTradingFees(symbol: string): Promise<{
    makerFee: number;
    takerFee: number;
  }> {
    // Hyperliquid has fixed fees
    return {
      makerFee: this.config.fees.maker,
      takerFee: this.config.fees.taker,
    };
  }

  public async setMarginMode(symbol: string, isolated: boolean): Promise<boolean> {
    try {
      const action = {
        type: 'updateIsolatedMargin',
        asset: await this.getAssetIndex(symbol),
        isCross: !isolated,
      };

      const signedAction = await this.signAction(action);
      await this.makeRequest<any>('POST', hyperliquidEndpoints.exchange, signedAction);
      return true;
    } catch (error) {
      logger.error(`Error setting Hyperliquid margin mode for ${symbol}:`, error);
      return false;
    }
  }
} 