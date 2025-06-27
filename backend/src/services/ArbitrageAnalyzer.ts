import { ArbitrageOpportunity, FundingRate, OrderBook } from '../types/common';
import { DataCollector } from './DataCollector';
import { SymbolMapper } from '../utils/symbolMapper';
import { Logger } from '../utils/logger';
import { arbitrageConfig } from '../config/arbitrage.config';
import { supabaseClient } from '../database/supabase.client';
import { TelegramBotService } from './TelegramBot';
import { 
  calculateBasisPoints, 
  calculateOptimalOrderSize, 
  calculateAnnualizedReturn,
  generateUUID
} from '../utils/helpers';
import { sleep } from '../utils/helpers';

export class ArbitrageAnalyzer {
  private logger: Logger;
  private dataCollector: DataCollector;
  private symbolMapper: SymbolMapper;
  private telegramBot: TelegramBotService;
  private lastAnalysisTime: string;

  constructor(dataCollector: DataCollector, telegramBot?: TelegramBotService) {
    this.logger = new Logger('ArbitrageAnalyzer');
    this.dataCollector = dataCollector;
    this.symbolMapper = SymbolMapper.getInstance();
    this.telegramBot = telegramBot || new TelegramBotService();
    this.lastAnalysisTime = new Date().toISOString();
  }

  public getLastAnalysisTime(): string {
    return this.lastAnalysisTime;
  }

  public async analyzeOpportunities(): Promise<ArbitrageOpportunity[]> {
    this.logger.info('Starting arbitrage opportunity analysis');

    // Verify we have fresh funding rate data
    const { data, error } = await supabaseClient
      .from('funding_rates')
      .select('count')
      .gte('timestamp', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // last 5 minutes
      .single();

    if (error || !data || data.count === 0) {
      this.logger.warn('No recent funding rates found, waiting for data collection...');
      await sleep(30000); // Wait 30 seconds and try again
      return this.analyzeOpportunities();
    }

    this.logger.info(`Found ${data.count} recent funding rates, proceeding with analysis`);
    const currentRates = await this.dataCollector.collectCurrentFundingRates();
    const opportunities: ArbitrageOpportunity[] = [];

    for (const [symbol, rates] of currentRates) {
      try {
        const opportunity = await this.analyzeSymbolOpportunity(symbol, rates);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      } catch (error) {
        this.logger.error(`Failed to analyze opportunity for ${symbol}:`, error);
      }
    }

    // Sort by estimated profit (descending)
    opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);

    this.logger.info(`Found ${opportunities.length} arbitrage opportunities`);
    
    // Store opportunities in database
    await this.storeOpportunities(opportunities);

    // Send Telegram alerts for new opportunities
    await this.sendOpportunityAlerts(opportunities);

    if (opportunities.length === 0) {
      this.logger.info('🔍 No profitable arbitrage opportunities found');
    }

    return opportunities;
  }

  private async analyzeSymbolOpportunity(
    symbol: string, 
    rates: FundingRate[]
  ): Promise<ArbitrageOpportunity | null> {
    if (rates.length < 2) {
      return null; // Need at least 2 exchanges for arbitrage
    }

    // Find the exchange with highest and lowest funding rates
    const sortedRates = rates.sort((a, b) => b.fundingRate - a.fundingRate);
    const highestRate = sortedRates[0];
    const lowestRate = sortedRates[sortedRates.length - 1];

    const fundingRateDiff = highestRate.fundingRate - lowestRate.fundingRate;
    const arbBasisPoints = calculateBasisPoints(highestRate.fundingRate, lowestRate.fundingRate);

    // Check if arbitrage meets minimum threshold
    if (arbBasisPoints < arbitrageConfig.minArbBps) {
      return null;
    }

    // Check if funding rate difference is persistent
    const isPersistent = await this.isPersistentFunding(symbol, highestRate.exchange, lowestRate.exchange);
    if (!isPersistent) {
      return null;
    }

    // Get order book depth to calculate optimal size
    const orderBooks = await this.dataCollector.collectOrderBookDepth(symbol);
    const optimalSize = this.calculateOptimalSize(orderBooks);

    if (optimalSize < 100) { // Minimum position size $100
      return null;
    }

    // Calculate estimated profit
    const estimatedProfit = this.calculateEstimatedProfit(
      fundingRateDiff,
      optimalSize,
      highestRate.exchange,
      lowestRate.exchange
    );

    // Calculate confidence and risk scores
    const confidence = this.calculateConfidence(rates, orderBooks);
    const riskScore = this.calculateRiskScore(symbol, fundingRateDiff, optimalSize);

    return {
      symbol,
      longExchange: lowestRate.exchange, // Go long where funding is low (we receive)
      shortExchange: highestRate.exchange, // Go short where funding is high (we pay)
      longFundingRate: lowestRate.fundingRate,
      shortFundingRate: highestRate.fundingRate,
      fundingRateDiff,
      arbBasisPoints: Math.round(arbBasisPoints),
      estimatedProfit,
      optimalSize,
      confidence,
      riskScore,
    };
  }

  private async isPersistentFunding(
    symbol: string,
    highExchange: string,
    lowExchange: string
  ): Promise<boolean> {
    try {
      const hours = arbitrageConfig.analysisWindowHours;
      
      const highRates = await this.dataCollector.getHistoricalFundingRates(symbol, highExchange, hours);
      const lowRates = await this.dataCollector.getHistoricalFundingRates(symbol, lowExchange, hours);

      if (highRates.length < 5 || lowRates.length < 5) {
        return false; // Not enough historical data
      }

      // Calculate average funding rates over the analysis window
      const avgHighRate = highRates.reduce((sum, rate) => sum + rate.fundingRate, 0) / highRates.length;
      const avgLowRate = lowRates.reduce((sum, rate) => sum + rate.fundingRate, 0) / lowRates.length;

      const avgDiff = avgHighRate - avgLowRate;
      const annualizedDiff = calculateAnnualizedReturn(avgDiff);

      // Check if the difference is persistent (>40% annualized)
      return Math.abs(annualizedDiff) > arbitrageConfig.minFundingRateThreshold;
    } catch (error) {
      this.logger.error('Failed to check funding persistence:', error);
      return false;
    }
  }

  private calculateOptimalSize(orderBooks: Map<string, OrderBook>): number {
    const orderBookArray = Array.from(orderBooks.values());
    
    if (orderBookArray.length < 2) {
      return 0;
    }

    // Find minimum available liquidity across all exchanges
    let minLiquidity = Number.MAX_SAFE_INTEGER;

    for (const orderBook of orderBookArray) {
      // Calculate available liquidity up to 0.5% slippage
      const bidLiquidity = this.calculateLiquidityAtSlippage(orderBook.bids, 0.005);
      const askLiquidity = this.calculateLiquidityAtSlippage(orderBook.asks, 0.005);
      
      const exchangeLiquidity = Math.min(bidLiquidity, askLiquidity);
      minLiquidity = Math.min(minLiquidity, exchangeLiquidity);
    }

    return calculateOptimalOrderSize(
      minLiquidity,
      arbitrageConfig.maxPositionSize,
      arbitrageConfig.riskManagement.totalCapital * 
      (arbitrageConfig.riskManagement.positionSizePercent / 100)
    );
  }

  private calculateLiquidityAtSlippage(
    orders: [number, number][], 
    maxSlippage: number
  ): number {
    if (orders.length === 0) return 0;

    const bestPrice = orders[0][0];
    const maxPrice = bestPrice * (1 + maxSlippage);
    
    let totalLiquidity = 0;
    
    for (const [price, quantity] of orders) {
      if (price <= maxPrice) {
        totalLiquidity += price * quantity;
      } else {
        break;
      }
    }

    return totalLiquidity;
  }

  private calculateEstimatedProfit(
    fundingRateDiff: number,
    positionSize: number,
    highExchange: string,
    lowExchange: string
  ): number {
    // Funding is typically paid every 8 hours
    const periodsPerDay = 3;
    
    // Calculate profit per period
    const profitPerPeriod = fundingRateDiff * positionSize;
    
    // Estimate fees (conservative)
    const highFees = this.getExchangeFees(highExchange);
    const lowFees = this.getExchangeFees(lowExchange);
    const totalFees = (highFees.taker + lowFees.taker) * positionSize;
    
    // Net profit per day
    const dailyProfit = (profitPerPeriod * periodsPerDay) - totalFees;
    
    return dailyProfit;
  }

  private getExchangeFees(exchangeName: string): { maker: number; taker: number } {
    // Default fee structure (should be pulled from exchange configs)
    const defaultFees = { maker: 0.0002, taker: 0.0006 };
    
    switch (exchangeName.toLowerCase()) {
      case 'bybit':
        return { maker: 0.0001, taker: 0.0006 };
      case 'bitget':
        return { maker: 0.0002, taker: 0.0006 };
      case 'kucoin':
        return { maker: 0.0002, taker: 0.0006 };
      case 'hyperliquid':
        return { maker: 0.0002, taker: 0.0005 };
      default:
        return defaultFees;
    }
  }

  private calculateConfidence(
    rates: FundingRate[],
    orderBooks: Map<string, OrderBook>
  ): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence if more exchanges have consistent rates
    if (rates.length >= 3) confidence += 0.2;
    if (rates.length >= 4) confidence += 0.1;

    // Higher confidence if order books have good depth
    const avgSpread = this.calculateAverageSpread(orderBooks);
    if (avgSpread < 0.001) confidence += 0.1; // Low spread = good liquidity
    if (avgSpread < 0.0005) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateRiskScore(
    symbol: string,
    fundingRateDiff: number,
    positionSize: number
  ): number {
    let riskScore = 0.3; // Base risk

    // Higher risk for larger positions
    const sizeRisk = positionSize / arbitrageConfig.maxPositionSize;
    riskScore += sizeRisk * 0.3;

    // Higher risk for extreme funding rate differences (might be temporary)
    if (Math.abs(fundingRateDiff) > 0.01) riskScore += 0.2; // 1% funding rate
    if (Math.abs(fundingRateDiff) > 0.02) riskScore += 0.2; // 2% funding rate

    // Symbol-specific risk (BTC/ETH are generally lower risk)
    if (!['BTC', 'ETH'].includes(symbol)) {
      riskScore += 0.1;
    }

    return Math.min(riskScore, 1.0);
  }

  private calculateAverageSpread(orderBooks: Map<string, OrderBook>): number {
    const spreads: number[] = [];

    for (const orderBook of orderBooks.values()) {
      if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const spread = (orderBook.asks[0][0] - orderBook.bids[0][0]) / orderBook.bids[0][0];
        spreads.push(spread);
      }
    }

    if (spreads.length === 0) return 1; // High spread if no data

    return spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length;
  }

  private async storeOpportunities(opportunities: ArbitrageOpportunity[]): Promise<void> {
    if (opportunities.length === 0) return;

    try {
      const records = opportunities.map(opp => ({
        symbol: opp.symbol,
        long_exchange: opp.longExchange,
        short_exchange: opp.shortExchange,
        long_funding_rate: opp.longFundingRate,
        short_funding_rate: opp.shortFundingRate,
        funding_rate_diff: opp.fundingRateDiff,
        arb_basis_points: opp.arbBasisPoints,
        estimated_profit: opp.estimatedProfit,
        optimal_size: opp.optimalSize,
        confidence: opp.confidence,
        risk_score: opp.riskScore,
        status: 'identified',
      }));

      const { error } = await supabaseClient
        .from('arbitrage_opportunities')
        .insert(records);

      if (error) {
        throw new Error(`Failed to store opportunities: ${error.message}`);
      }

      this.logger.debug(`Stored ${records.length} arbitrage opportunities`);
    } catch (error) {
      this.logger.error('Failed to store opportunities:', error);
    }
  }

  private async sendOpportunityAlerts(opportunities: ArbitrageOpportunity[]): Promise<void> {
    if (opportunities.length === 0 || !this.telegramBot.isActive()) return;

    try {
      // Send alerts for high-quality opportunities only
      const highQualityOpportunities = opportunities.filter(opp => 
        opp.confidence > 0.6 && 
        opp.riskScore < 0.7 && 
        opp.estimatedProfit > 20 // Minimum $20 profit
      );

      // Limit to top 3 opportunities to avoid spam
      const topOpportunities = highQualityOpportunities.slice(0, 3);

      for (const opportunity of topOpportunities) {
        await this.telegramBot.sendOpportunityAlert(opportunity);
        
        // Add small delay between alerts to avoid rate limiting
        if (topOpportunities.length > 1) {
          await sleep(1000);
        }
      }

      if (topOpportunities.length > 0) {
        this.logger.info(`Sent ${topOpportunities.length} opportunity alerts to Telegram`);
      }
    } catch (error) {
      this.logger.error('Failed to send opportunity alerts:', error);
    }
  }

  public async executeOpportunity(opportunityId: string): Promise<{ success: boolean; strategyId: string; error?: string }> {
    try {
      // Get opportunity details
      const { data: opportunity } = await supabaseClient
        .from('arbitrage_opportunities')
        .select('*')
        .eq('id', opportunityId)
        .single();

      if (!opportunity) {
        return {
          success: false,
          strategyId: '',
          error: 'Opportunity not found'
        };
      }

      // Check if opportunity is still valid
      if (opportunity.status !== 'identified') {
        return {
          success: false,
          strategyId: '',
          error: 'Opportunity is no longer valid'
        };
      }

      // Generate strategy ID
      const strategyId = `strategy_${Date.now()}`;

      // Update opportunity status
      await supabaseClient
        .from('arbitrage_opportunities')
        .update({ status: 'executing', strategy_id: strategyId })
        .eq('id', opportunityId);

      // Notify via Telegram if configured
      if (this.telegramBot) {
        await this.telegramBot.sendMessage(
          `🚀 Executing opportunity ${opportunityId}\n` +
          `Symbol: ${opportunity.symbol}\n` +
          `Expected Profit: ${opportunity.estimated_profit} USD`
        );
      }

      return {
        success: true,
        strategyId
      };
    } catch (error) {
      this.logger.error('Error executing opportunity:', error);
      return {
        success: false,
        strategyId: '',
        error: 'Execution failed'
      };
    }
  }
} 