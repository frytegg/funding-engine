import { IExchange } from '../exchanges/interfaces/IExchange';
import { DataCollector } from './DataCollector';
import { 
  ArbitrageOpportunity, 
  FundingRate, 
  OrderBook,
  OrderBookLevel 
} from '../types/common';
import { logger, logArbitrage, logError } from '../utils/logger';
import { 
  calculateFundingRateAverage, 
  calculateBasisPoints, 
  calculateOptimalOrderSize,
  retryWithBackoff 
} from '../utils/helpers';
import { arbitrageConfig, riskLimits } from '../config/arbitrage.config';

export class ArbitrageAnalyzer {
  private dataCollector: DataCollector;

  constructor(dataCollector: DataCollector) {
    this.dataCollector = dataCollector;
  }

  public async findOpportunities(exchanges: IExchange[]): Promise<ArbitrageOpportunity[]> {
    logger.info('Analyzing arbitrage opportunities');
    const opportunities: ArbitrageOpportunity[] = [];

    try {
      // Analyze each symbol
      for (const baseSymbol of arbitrageConfig.symbols) {
        const symbolOpportunities = await this.analyzeSymbol(exchanges, baseSymbol);
        opportunities.push(...symbolOpportunities);
      }

      // Sort by estimated profit
      opportunities.sort((a, b) => b.estimatedProfitBps - a.estimatedProfitBps);

      logger.info(`Found ${opportunities.length} arbitrage opportunities`);
      
      // Log top opportunities
      opportunities.slice(0, 3).forEach(opp => {
        logArbitrage({
          action: 'opportunity_found',
          baseSymbol: opp.baseSymbol,
          longExchange: opp.longExchange,
          shortExchange: opp.shortExchange,
          profitBps: opp.estimatedProfitBps,
          size: opp.maxSize,
          success: true,
        });
      });

      return opportunities;
    } catch (error) {
      logError(error as Error, { context: 'findOpportunities' });
      return [];
    }
  }

  private async analyzeSymbol(
    exchanges: IExchange[], 
    baseSymbol: string
  ): Promise<ArbitrageOpportunity[]> {
    try {
      // Get funding rates and order books for all exchanges
      const exchangeData = await this.collectExchangeData(exchanges, baseSymbol);
      
      if (exchangeData.length < 2) {
        logger.debug(`Insufficient exchange data for ${baseSymbol}`);
        return [];
      }

      const opportunities: ArbitrageOpportunity[] = [];

      // Compare each pair of exchanges
      for (let i = 0; i < exchangeData.length; i++) {
        for (let j = i + 1; j < exchangeData.length; j++) {
          const exchange1 = exchangeData[i];
          const exchange2 = exchangeData[j];

          // Determine which exchange should be long and which should be short
          // Higher funding rate = more expensive to hold long = should be short
          if (exchange1.avgFundingRate > exchange2.avgFundingRate) {
            // Exchange1 has higher funding rate, so short there, long on exchange2
            const opportunity = await this.analyzeOpportunity(
              exchange2, // Long exchange (lower funding rate)
              exchange1, // Short exchange (higher funding rate)
              baseSymbol
            );
            if (opportunity) opportunities.push(opportunity);
          } else if (exchange2.avgFundingRate > exchange1.avgFundingRate) {
            // Exchange2 has higher funding rate, so short there, long on exchange1
            const opportunity = await this.analyzeOpportunity(
              exchange1, // Long exchange (lower funding rate)
              exchange2, // Short exchange (higher funding rate)
              baseSymbol
            );
            if (opportunity) opportunities.push(opportunity);
          }
        }
      }

      return opportunities;
    } catch (error) {
      logError(error as Error, { 
        context: 'analyzeSymbol', 
        baseSymbol 
      });
      return [];
    }
  }

  private async collectExchangeData(
    exchanges: IExchange[], 
    baseSymbol: string
  ): Promise<Array<{
    exchange: IExchange;
    symbol: string;
    avgFundingRate: number;
    fundingRates: FundingRate[];
    orderBook: OrderBook;
    isPersistent: boolean;
  }>> {
    const data = await Promise.allSettled(
      exchanges.map(async (exchange) => {
        try {
          const symbol = this.getExchangeSymbol(exchange.getName(), baseSymbol);
          if (!symbol) return null;

          // Get historical funding rates
          const fundingRates = await this.dataCollector.getFundingRateHistory(
            exchange.getName(),
            symbol,
            arbitrageConfig.analysisWindowHours
          );

          if (fundingRates.length === 0) {
            logger.debug(`No funding rate history for ${symbol} on ${exchange.getName()}`);
            return null;
          }

          // Get current order book
          const orderBook = await retryWithBackoff(() => 
            exchange.getOrderBook(symbol, 50)
          );

          // Calculate average funding rate
          const rates = fundingRates.map(fr => fr.fundingRate);
          const avgFundingRate = calculateFundingRateAverage(rates);

          // Check if funding rate is persistent
          const isPersistent = this.isPersistentFunding(fundingRates);

          return {
            exchange,
            symbol,
            avgFundingRate,
            fundingRates,
            orderBook,
            isPersistent,
          };
        } catch (error) {
          logError(error as Error, {
            context: 'collectExchangeData',
            exchange: exchange.getName(),
            baseSymbol
          });
          return null;
        }
      })
    );

    return data
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => (result as PromiseFulfilledResult<any>).value);
  }

  private async analyzeOpportunity(
    longExchangeData: any,
    shortExchangeData: any,
    baseSymbol: string
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Calculate funding rate difference
      const fundingRateDiff = shortExchangeData.avgFundingRate - longExchangeData.avgFundingRate;
      
      // Check minimum thresholds
      if (fundingRateDiff < arbitrageConfig.minFundingRateThreshold) {
        return null;
      }

      // Check if funding rates are persistent on both exchanges
      if (!longExchangeData.isPersistent || !shortExchangeData.isPersistent) {
        logger.debug(`Funding rates not persistent for ${baseSymbol}`);
        return null;
      }

      // Analyze order book liquidity
      const liquidity = this.analyzeLiquidity(
        longExchangeData.orderBook,
        shortExchangeData.orderBook
      );

      if (liquidity.maxSize === 0) {
        logger.debug(`Insufficient liquidity for ${baseSymbol}`);
        return null;
      }

      // Calculate estimated profit
      const estimatedProfitBps = this.calculateProfitBps(
        longExchangeData,
        shortExchangeData,
        liquidity
      );

      if (estimatedProfitBps < arbitrageConfig.minArbBps) {
        return null;
      }

      // Calculate required capital
      const midPrice = (longExchangeData.orderBook.bids[0].price + longExchangeData.orderBook.asks[0].price) / 2;
      const requiredCapital = midPrice * liquidity.maxSize * 2; // Both long and short positions

      // Check capital limits
      if (requiredCapital > arbitrageConfig.maxPositionSizePerExchange * 2) {
        logger.debug(`Required capital too high for ${baseSymbol}: ${requiredCapital}`);
        return null;
      }

      // Calculate confidence score
      const confidence = this.calculateConfidence(
        longExchangeData,
        shortExchangeData,
        liquidity
      );

      const opportunity: ArbitrageOpportunity = {
        baseSymbol,
        longExchange: longExchangeData.exchange.getName(),
        shortExchange: shortExchangeData.exchange.getName(),
        longSymbol: longExchangeData.symbol,
        shortSymbol: shortExchangeData.symbol,
        avgFundingRateDiff: fundingRateDiff,
        estimatedProfitBps,
        requiredCapital,
        maxSize: liquidity.maxSize,
        longOrderBook: longExchangeData.orderBook,
        shortOrderBook: shortExchangeData.orderBook,
        confidence,
        timestamp: new Date(),
      };

      logger.info(`Arbitrage opportunity found for ${baseSymbol}:`, {
        longExchange: opportunity.longExchange,
        shortExchange: opportunity.shortExchange,
        profitBps: opportunity.estimatedProfitBps,
        requiredCapital: opportunity.requiredCapital,
        confidence: opportunity.confidence,
      });

      return opportunity;
    } catch (error) {
      logError(error as Error, {
        context: 'analyzeOpportunity',
        baseSymbol,
        longExchange: longExchangeData.exchange.getName(),
        shortExchange: shortExchangeData.exchange.getName(),
      });
      return null;
    }
  }

  private isPersistentFunding(fundingRates: FundingRate[]): boolean {
    if (fundingRates.length < 6) return false; // Need at least 6 data points (48 hours)

    // Check if funding rate has been consistently positive/negative
    const rates = fundingRates.map(fr => fr.fundingRate);
    const positiveCount = rates.filter(rate => rate > 0).length;
    const negativeCount = rates.filter(rate => rate < 0).length;
    
    // At least 80% of rates should be in the same direction
    const persistenceRatio = Math.max(positiveCount, negativeCount) / rates.length;
    
    return persistenceRatio >= 0.8;
  }

  private analyzeLiquidity(
    longOrderBook: OrderBook,
    shortOrderBook: OrderBook
  ): {
    maxSize: number;
    longExecutionPrice: number;
    shortExecutionPrice: number;
    slippage: number;
  } {
    try {
      // Calculate available liquidity within slippage limits
      const maxSlippageBps = riskLimits.maxSlippageBps;
      const maxSlippage = maxSlippageBps / 10000;

      // For long position, we buy at ask prices
      const longMidPrice = (longOrderBook.bids[0].price + longOrderBook.asks[0].price) / 2;
      const maxLongPrice = longMidPrice * (1 + maxSlippage);
      
      let longSize = 0;
      let longValue = 0;
      for (const ask of longOrderBook.asks) {
        if (ask.price <= maxLongPrice) {
          longSize += ask.quantity;
          longValue += ask.price * ask.quantity;
        } else {
          break;
        }
      }

      // For short position, we sell at bid prices
      const shortMidPrice = (shortOrderBook.bids[0].price + shortOrderBook.asks[0].price) / 2;
      const minShortPrice = shortMidPrice * (1 - maxSlippage);
      
      let shortSize = 0;
      let shortValue = 0;
      for (const bid of shortOrderBook.bids) {
        if (bid.price >= minShortPrice) {
          shortSize += bid.quantity;
          shortValue += bid.price * bid.quantity;
        } else {
          break;
        }
      }

      // Maximum size is limited by the smaller of the two
      const maxSize = Math.min(longSize, shortSize);
      
      if (maxSize === 0) {
        return {
          maxSize: 0,
          longExecutionPrice: 0,
          shortExecutionPrice: 0,
          slippage: 0,
        };
      }

      // Calculate weighted average execution prices
      const longExecutionPrice = longValue / longSize;
      const shortExecutionPrice = shortValue / shortSize;
      
      // Calculate slippage
      const longSlippage = (longExecutionPrice - longMidPrice) / longMidPrice;
      const shortSlippage = (shortMidPrice - shortExecutionPrice) / shortMidPrice;
      const totalSlippage = longSlippage + shortSlippage;

      return {
        maxSize,
        longExecutionPrice,
        shortExecutionPrice,
        slippage: totalSlippage,
      };
    } catch (error) {
      logError(error as Error, { context: 'analyzeLiquidity' });
      return {
        maxSize: 0,
        longExecutionPrice: 0,
        shortExecutionPrice: 0,
        slippage: 0,
      };
    }
  }

  private calculateProfitBps(
    longExchangeData: any,
    shortExchangeData: any,
    liquidity: any
  ): number {
    try {
      // Daily funding rate difference
      const dailyFundingDiff = (shortExchangeData.avgFundingRate - longExchangeData.avgFundingRate) * 3; // 3 funding periods per day
      
      // Convert to basis points
      const fundingProfitBps = dailyFundingDiff * 10000;
      
      // Subtract trading costs
      const longFees = longExchangeData.exchange.config?.fees?.taker || 0.0006;
      const shortFees = shortExchangeData.exchange.config?.fees?.taker || 0.0006;
      const totalFeesBps = (longFees + shortFees) * 10000;
      
      // Subtract slippage costs
      const slippageBps = liquidity.slippage * 10000;
      
      // Net profit = funding profit - fees - slippage
      const netProfitBps = fundingProfitBps - totalFeesBps - slippageBps;
      
      return netProfitBps;
    } catch (error) {
      logError(error as Error, { context: 'calculateProfitBps' });
      return 0;
    }
  }

  private calculateConfidence(
    longExchangeData: any,
    shortExchangeData: any,
    liquidity: any
  ): number {
    try {
      let confidence = 1.0;
      
      // Reduce confidence based on data age
      const now = new Date();
      const longDataAge = (now.getTime() - longExchangeData.orderBook.timestamp.getTime()) / (1000 * 60); // minutes
      const shortDataAge = (now.getTime() - shortExchangeData.orderBook.timestamp.getTime()) / (1000 * 60);
      const maxDataAge = Math.max(longDataAge, shortDataAge);
      
      if (maxDataAge > 5) confidence *= 0.8; // Reduce if data is over 5 minutes old
      if (maxDataAge > 15) confidence *= 0.6; // Further reduce if over 15 minutes old
      
      // Reduce confidence based on liquidity
      const minLiquidityUsd = riskLimits.maxOrderBookDepthUsd;
      const longLiquidityUsd = liquidity.longExecutionPrice * liquidity.maxSize;
      const shortLiquidityUsd = liquidity.shortExecutionPrice * liquidity.maxSize;
      const minLiquidity = Math.min(longLiquidityUsd, shortLiquidityUsd);
      
      if (minLiquidity < minLiquidityUsd) {
        confidence *= minLiquidity / minLiquidityUsd;
      }
      
      // Reduce confidence based on slippage
      const slippageRatio = Math.abs(liquidity.slippage) / (riskLimits.maxSlippageBps / 10000);
      confidence *= (1 - slippageRatio * 0.3);
      
      // Reduce confidence based on funding rate volatility
      const longVolatility = this.calculateFundingVolatility(longExchangeData.fundingRates);
      const shortVolatility = this.calculateFundingVolatility(shortExchangeData.fundingRates);
      const avgVolatility = (longVolatility + shortVolatility) / 2;
      
      if (avgVolatility > 0.001) { // 0.1% volatility threshold
        confidence *= (1 - avgVolatility * 100); // Reduce by volatility percentage
      }
      
      return Math.max(0, Math.min(1, confidence));
    } catch (error) {
      logError(error as Error, { context: 'calculateConfidence' });
      return 0;
    }
  }

  private calculateFundingVolatility(fundingRates: FundingRate[]): number {
    if (fundingRates.length < 2) return 0;
    
    const rates = fundingRates.map(fr => fr.fundingRate);
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / rates.length;
    
    return Math.sqrt(variance);
  }

  private getExchangeSymbol(exchangeName: string, baseSymbol: string): string {
    // Simple mapping for now - should use SymbolMapper in production
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

  public async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      logger.info(`Validating opportunity for ${opportunity.baseSymbol}`);
      
      // Check if opportunity is still fresh (less than 2 minutes old)
      const ageMinutes = (Date.now() - opportunity.timestamp.getTime()) / (1000 * 60);
      if (ageMinutes > 2) {
        logger.warn(`Opportunity too old: ${ageMinutes} minutes`);
        return false;
      }
      
      // Check if estimated profit still meets minimum threshold
      if (opportunity.estimatedProfitBps < arbitrageConfig.minArbBps) {
        logger.warn(`Profit below threshold: ${opportunity.estimatedProfitBps} bps`);
        return false;
      }
      
      // Check if confidence is sufficient
      if (opportunity.confidence < 0.7) {
        logger.warn(`Confidence too low: ${opportunity.confidence}`);
        return false;
      }
      
      logger.info(`Opportunity validated for ${opportunity.baseSymbol}`);
      return true;
    } catch (error) {
      logError(error as Error, { 
        context: 'validateOpportunity',
        opportunity: {
          baseSymbol: opportunity.baseSymbol,
          longExchange: opportunity.longExchange,
          shortExchange: opportunity.shortExchange,
        }
      });
      return false;
    }
  }
} 