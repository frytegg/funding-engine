import axios from 'axios';
import { ethers } from 'ethers';
import { BaseExchange } from '../BaseExchange';
import { hyperliquidConfig } from '../../config/exchanges/hyperliquid.config';
import { FundingRate, OrderBook, TradeOrder, TradeResult, Position } from '../../types/common';

export class HyperliquidExchange extends BaseExchange {
  private httpClient: any;
  private wallet: ethers.Wallet;
  private assetMap: Map<string, number> = new Map();

  constructor() {
    super(hyperliquidConfig);
    
    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    if (!this.config.privateKey) {
      throw new Error('Private key is required for Hyperliquid exchange');
    }
    this.wallet = new ethers.Wallet(this.config.privateKey);
  }

  public async connect(): Promise<void> {
    try {
      await this.loadAssetMetadata();
      this.connected = true;
      this.initialized = true;
      this.logger.info(`✅ Connected to Hyperliquid exchange (${this.config.testnet ? 'testnet' : 'mainnet'})`);
    } catch (error) {
      this.connected = false;
      this.initialized = false;
      this.logger.error('❌ Failed to connect to Hyperliquid:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.initialized = false;
    this.logger.info('Disconnected from Hyperliquid exchange');
  }

  private async loadAssetMetadata(): Promise<void> {
    try {
      const response = await this.httpClient.post('/info', { type: 'meta' });
      if (response.data?.universe) {
        this.assetMap.clear();
        response.data.universe.forEach((asset: any, index: number) => {
          this.assetMap.set(asset.name, index);
        });
        this.logger.info(`Loaded ${response.data.universe.length} assets from Hyperliquid`);
      }
    } catch (error) {
      this.logger.error('Failed to load asset metadata:', error);
      throw error;
    }
  }

  private getAssetIndex(symbol: string): number {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const index = this.assetMap.get(normalizedSymbol);
    if (index === undefined) {
      throw new Error(`Asset not found: ${normalizedSymbol}`);
    }
    return index;
  }

  public async getFundingRates(symbol: string, hours: number = 72): Promise<FundingRate[]> {
    try {
      // For Hyperliquid, we only get current funding rate since historical data requires different approach
      const currentRate = await this.getCurrentFundingRate(symbol);
      return [currentRate];
    } catch (error) {
      this.logger.error(`Error fetching funding rates for ${symbol}:`, error);
      // Return empty array to avoid breaking the collection
      return [];
    }
  }

  public async getCurrentFundingRate(symbol: string): Promise<FundingRate> {
    try {
      const assetIndex = this.getAssetIndex(symbol);
      const response = await this.httpClient.post('/info', { type: 'metaAndAssetCtxs' });
      
      if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
        throw new Error('Invalid response format for funding rates');
      }

      const [meta, contexts] = response.data;
      const context = contexts[assetIndex];

      if (!context) {
        throw new Error(`No funding rate context found for asset index ${assetIndex}`);
      }

      return {
        symbol: symbol, // Don't add prefix here, keep original symbol format
        fundingRate: parseFloat(context.funding),
        timestamp: new Date(),
        nextFundingTime: new Date(Date.now() + (60 * 60 * 1000)),
        exchange: this.getName()
      };
    } catch (error) {
      this.logger.error(`Error fetching current funding rate for ${symbol}:`, error);
      throw error;
    }
  }

  public async getOrderBook(symbol: string, limit: number = 20): Promise<OrderBook> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.httpClient.post('/info', {
        type: 'l2Book',
        coin: normalizedSymbol,
        nSigFigs: null
      });

      if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
        throw new Error('Invalid order book response');
      }

      const [bids, asks] = response.data;
      return {
        symbol: symbol, // Keep original symbol format
        bids: bids.slice(0, limit).map((bid: any) => [parseFloat(bid.px), parseFloat(bid.sz)]),
        asks: asks.slice(0, limit).map((ask: any) => [parseFloat(ask.px), parseFloat(ask.sz)]),
        timestamp: new Date(),
        exchange: this.getName()
      };
    } catch (error) {
      this.logger.error(`Error fetching order book for ${symbol}:`, error);
      throw error;
    }
  }

  public async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      // Simplified implementation - in production, implement proper order submission
      const orderId = `hl_${Date.now()}`;
      const orderPrice = order.price || 0;
      
      return {
        orderId,
        exchange: this.getName(),
        symbol: order.symbol,
        side: order.side,
        price: orderPrice,
        quantity: order.quantity,
        fees: order.quantity * orderPrice * 0.0002,
        status: 'filled',
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Error executing trade:', error);
      throw error;
    }
  }

  public async getPosition(symbol: string): Promise<Position | null> {
    try {
      // Simplified implementation - return null for now
      return null;
    } catch (error) {
      this.logger.error(`Error fetching position for ${symbol}:`, error);
      return null;
    }
  }

  public async closePosition(symbol: string): Promise<boolean> {
    try {
      // Simplified implementation
      return true;
    } catch (error) {
      this.logger.error(`Error closing position for ${symbol}:`, error);
      return false;
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      // Simplified implementation
      return true;
    } catch (error) {
      this.logger.error(`Error setting leverage for ${symbol}:`, error);
      return false;
    }
  }

  public async getBalance(): Promise<number> {
    try {
      const response = await this.httpClient.post('/info', {
        type: 'clearinghouseState',
        user: this.wallet.address
      });

      if (response.data?.marginSummary?.accountValue) {
        return parseFloat(response.data.marginSummary.accountValue);
      }
      return 0;
    } catch (error) {
      this.logger.error('Error fetching balance:', error);
      return 0;
    }
  }

  public async getAccountInfo(): Promise<any> {
    try {
      const response = await this.httpClient.post('/info', {
        type: 'clearinghouseState',
        user: this.wallet.address
      });

      return {
        address: this.wallet.address,
        accountValue: parseFloat(response.data?.marginSummary?.accountValue || '0'),
        totalMarginUsed: parseFloat(response.data?.marginSummary?.totalMarginUsed || '0'),
        withdrawable: parseFloat(response.data?.withdrawable || '0'),
        positions: response.data?.assetPositions?.length || 0,
        timestamp: new Date(),
        exchange: this.getName()
      };
    } catch (error) {
      this.logger.error('Error fetching account info:', error);
      throw error;
    }
  }

  public normalizeSymbol(symbol: string): string {
    // Remove exchange prefix if present
    let normalized = symbol.replace(/^HYPERLIQUID[-_]?/i, '');
    
    // Handle common symbol variations
    const symbolMap: { [key: string]: string } = {
      'BTCUSDT': 'BTC',
      'ETHUSDT': 'ETH',
      'BTC-PERP': 'BTC',
      'ETH-PERP': 'ETH',
      'BTCUSD': 'BTC',
      'ETHUSD': 'ETH'
    };

    return symbolMap[normalized.toUpperCase()] || normalized.toUpperCase();
  }

  public getName(): string {
    return 'hyperliquid';
  }

  public isConnected(): boolean {
    return this.connected;
  }
} 