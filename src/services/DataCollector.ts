import { IExchange } from '../exchanges/interfaces/IExchange';
import { SupabaseClientManager } from '../database/supabase.client';
import { FundingRate, OrderBook } from '../types/common';
import { logger, logError } from '../utils/logger';
import { sleep, retryWithBackoff } from '../utils/helpers';
import { arbitrageConfig, tradingParams } from '../config/arbitrage.config';

export class DataCollector {
  private dbClient: SupabaseClientManager;
  private isRunning = false;
  private collectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.dbClient = SupabaseClientManager.getInstance();
  }

  public async start(exchanges: IExchange[]): Promise<void> {
    if (this.isRunning) {
      logger.warn('DataCollector is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting DataCollector service');

    // Start continuous data collection
    this.collectionInterval = setInterval(() => {
      this.collectAllData(exchanges);
    }, tradingParams.dataCollectionIntervalMs);

    // Initial collection
    await this.collectAllData(exchanges);
  }

  public stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    this.isRunning = false;
    logger.info('DataCollector service stopped');
  }

  private async collectAllData(exchanges: IExchange[]): Promise<void> {
    logger.info('Starting data collection cycle');

    try {
      // Collect funding rates and order book data for all symbols
      const tasks = arbitrageConfig.symbols.map(async (baseSymbol) => {
        await this.collectSymbolData(exchanges, baseSymbol);
      });

      await Promise.allSettled(tasks);
      logger.info('Data collection cycle completed');
    } catch (error) {
      logError(error as Error, { context: 'collectAllData' });
    }
  }

  private async collectSymbolData(exchanges: IExchange[], baseSymbol: string): Promise<void> {
    try {
      const tasks = exchanges.map(async (exchange) => {
        await this.collectExchangeSymbolData(exchange, baseSymbol);
      });

      await Promise.allSettled(tasks);
    } catch (error) {
      logError(error as Error, { 
        context: 'collectSymbolData', 
        baseSymbol 
      });
    }
  }

  private async collectExchangeSymbolData(
    exchange: IExchange, 
    baseSymbol: string
  ): Promise<void> {
    try {
      // Get exchange-specific symbol
      const exchangeSymbol = this.getExchangeSymbol(exchange.getName(), baseSymbol);
      if (!exchangeSymbol) {
        logger.warn(`No symbol mapping for ${baseSymbol} on ${exchange.getName()}`);
        return;
      }

      // Check if symbol is supported
      const isSupported = await exchange.isSymbolSupported(exchangeSymbol);
      if (!isSupported) {
        logger.warn(`Symbol ${exchangeSymbol} not supported on ${exchange.getName()}`);
        return;
      }

      // Collect current funding rate
      await this.collectCurrentFundingRate(exchange, exchangeSymbol);

      // Collect order book depth
      await this.collectOrderBookDepth(exchange, exchangeSymbol);

    } catch (error) {
      logError(error as Error, { 
        context: 'collectExchangeSymbolData',
        exchange: exchange.getName(),
        baseSymbol 
      });
    }
  }

  private async collectCurrentFundingRate(
    exchange: IExchange, 
    symbol: string
  ): Promise<void> {
    try {
      const fundingRate = await retryWithBackoff(
        () => exchange.getCurrentFundingRate(symbol),
        tradingParams.retryAttempts,
        tradingParams.retryDelayMs
      );

      if (fundingRate) {
        await this.storeFundingRate(fundingRate);
        logger.debug(`Collected funding rate for ${symbol} on ${exchange.getName()}: ${fundingRate.fundingRate}`);
      }
    } catch (error) {
      logError(error as Error, { 
        context: 'collectCurrentFundingRate',
        exchange: exchange.getName(),
        symbol 
      });
    }
  }

  private async collectOrderBookDepth(
    exchange: IExchange, 
    symbol: string
  ): Promise<void> {
    try {
      const orderBook = await retryWithBackoff(
        () => exchange.getOrderBook(symbol, 50), // Get top 50 levels
        tradingParams.retryAttempts,
        tradingParams.retryDelayMs
      );

      if (orderBook) {
        await this.storeOrderBookDepth(orderBook);
        logger.debug(`Collected order book for ${symbol} on ${exchange.getName()}`);
      }
    } catch (error) {
      logError(error as Error, { 
        context: 'collectOrderBookDepth',
        exchange: exchange.getName(),
        symbol 
      });
    }
  }

  public async collectHistoricalFundingRates(
    exchanges: IExchange[], 
    symbols: string[], 
    hours: number
  ): Promise<void> {
    logger.info(`Collecting ${hours} hours of historical funding rates`);

    try {
      const tasks = exchanges.flatMap(exchange =>
        symbols.map(async (baseSymbol) => {
          const exchangeSymbol = this.getExchangeSymbol(exchange.getName(), baseSymbol);
          if (!exchangeSymbol) return;

          try {
            const fundingRates = await exchange.getFundingRates(exchangeSymbol, hours);
            
            for (const rate of fundingRates) {
              await this.storeFundingRate(rate);
            }

            logger.info(`Collected ${fundingRates.length} historical funding rates for ${exchangeSymbol} on ${exchange.getName()}`);
          } catch (error) {
            logError(error as Error, {
              context: 'collectHistoricalFundingRates',
              exchange: exchange.getName(),
              symbol: exchangeSymbol
            });
          }
        })
      );

      await Promise.allSettled(tasks);
      logger.info('Historical funding rate collection completed');
    } catch (error) {
      logError(error as Error, { context: 'collectHistoricalFundingRates' });
    }
  }

  public async analyzeLiquidity(
    exchange: IExchange, 
    symbol: string, 
    maxPriceImpact: number = 0.02 // 2% max price impact
  ): Promise<{
    bidLiquidity: number;
    askLiquidity: number;
    bidDepthUsd: number;
    askDepthUsd: number;
  }> {
    try {
      const orderBook = await exchange.getOrderBook(symbol, 50);
      
      const midPrice = (orderBook.bids[0].price + orderBook.asks[0].price) / 2;
      const maxBidPrice = midPrice * (1 - maxPriceImpact);
      const minAskPrice = midPrice * (1 + maxPriceImpact);

      let bidLiquidity = 0;
      let bidDepthUsd = 0;
      for (const bid of orderBook.bids) {
        if (bid.price >= maxBidPrice) {
          bidLiquidity += bid.quantity;
          bidDepthUsd += bid.price * bid.quantity;
        } else {
          break;
        }
      }

      let askLiquidity = 0;
      let askDepthUsd = 0;
      for (const ask of orderBook.asks) {
        if (ask.price <= minAskPrice) {
          askLiquidity += ask.quantity;
          askDepthUsd += ask.price * ask.quantity;
        } else {
          break;
        }
      }

      return {
        bidLiquidity,
        askLiquidity,
        bidDepthUsd,
        askDepthUsd,
      };
    } catch (error) {
      logError(error as Error, { 
        context: 'analyzeLiquidity',
        exchange: exchange.getName(),
        symbol 
      });
      
      return {
        bidLiquidity: 0,
        askLiquidity: 0,
        bidDepthUsd: 0,
        askDepthUsd: 0,
      };
    }
  }

  private async storeFundingRate(fundingRate: FundingRate): Promise<void> {
    try {
      await this.dbClient.insertFundingRate(
        fundingRate.exchange,
        fundingRate.symbol,
        fundingRate.fundingRate,
        fundingRate.timestamp
      );
    } catch (error) {
      logError(error as Error, { 
        context: 'storeFundingRate',
        fundingRate 
      });
    }
  }

  private async storeOrderBookDepth(orderBook: OrderBook): Promise<void> {
    try {
      // Calculate depth metrics
      const bidDepth = this.calculateDepthMetrics(orderBook.bids);
      const askDepth = this.calculateDepthMetrics(orderBook.asks);

      await this.dbClient.insertOrderbookDepth(
        orderBook.exchange,
        orderBook.symbol,
        bidDepth,
        askDepth,
        orderBook.timestamp
      );
    } catch (error) {
      logError(error as Error, { 
        context: 'storeOrderBookDepth',
        orderBook: {
          exchange: orderBook.exchange,
          symbol: orderBook.symbol,
          timestamp: orderBook.timestamp
        }
      });
    }
  }

  private calculateDepthMetrics(levels: Array<{ price: number; quantity: number }>) {
    if (levels.length === 0) return {};

    const topPrice = levels[0].price;
    const depths = [0.001, 0.005, 0.01, 0.02, 0.05]; // 0.1%, 0.5%, 1%, 2%, 5%

    const metrics: any = {
      topPrice,
      totalQuantity: levels.reduce((sum, level) => sum + level.quantity, 0),
      totalValue: levels.reduce((sum, level) => sum + level.price * level.quantity, 0),
      levels: levels.slice(0, 10), // Top 10 levels
    };

    // Calculate liquidity at different depth levels
    for (const depth of depths) {
      const priceThreshold = topPrice * (1 + depth);
      let quantity = 0;
      let value = 0;

      for (const level of levels) {
        if (Math.abs(level.price - topPrice) / topPrice <= depth) {
          quantity += level.quantity;
          value += level.price * level.quantity;
        } else {
          break;
        }
      }

      metrics[`depth_${depth * 100}%`] = { quantity, value };
    }

    return metrics;
  }

  private getExchangeSymbol(exchangeName: string, baseSymbol: string): string {
    // This would normally use the SymbolMapper, but for now we'll use a simple mapping
    const symbolMappings: Record<string, Record<string, string>> = {
      'bybit': {
        'BTC/USDT': 'BTCUSDT',
        'ETH/USDT': 'ETHUSDT',
        'SOL/USDT': 'SOLUSDT',
        'AVAX/USDT': 'AVAXUSDT',
        'MATIC/USDT': 'MATICUSDT',
        'ADA/USDT': 'ADAUSDT',
        'DOT/USDT': 'DOTUSDT',
        'LINK/USDT': 'LINKUSDT',
        'UNI/USDT': 'UNIUSDT',
        'ATOM/USDT': 'ATOMUSDT',
      },
      // Add other exchanges here...
    };

    return symbolMappings[exchangeName]?.[baseSymbol] || '';
  }

  public async getFundingRateHistory(
    exchange: string,
    symbol: string,
    hoursBack: number
  ): Promise<FundingRate[]> {
    try {
      const data = await this.dbClient.getFundingRatesHistory(exchange, symbol, hoursBack);
      
      return data.map(row => ({
        exchange: row.exchange,
        symbol: row.symbol,
        fundingRate: row.funding_rate,
        timestamp: new Date(row.timestamp),
        nextFundingTime: new Date(row.timestamp), // This would need proper calculation
      }));
    } catch (error) {
      logError(error as Error, { 
        context: 'getFundingRateHistory',
        exchange,
        symbol,
        hoursBack 
      });
      return [];
    }
  }

  public getStatus(): {
    isRunning: boolean;
    lastCollectionTime: Date | null;
    collectionsCount: number;
  } {
    return {
      isRunning: this.isRunning,
      lastCollectionTime: null, // Could track this
      collectionsCount: 0, // Could track this
    };
  }
} 