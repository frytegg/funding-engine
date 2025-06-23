import { v4 as uuidv4 } from 'uuid';
import { IExchange } from '../exchanges/interfaces/IExchange';
import { SupabaseClientManager } from '../database/supabase.client';
import { 
  ArbitrageOpportunity, 
  TradeOrder, 
  TradeResult, 
  Position, 
  TPSLLevels,
  StrategyPosition 
} from '../types/common';
import { logger, logError, logTrade } from '../utils/logger';
import { tradingParams, riskLimits } from '../config/arbitrage.config';
import { retryWithBackoff, sleep } from '../utils/helpers';
import { TelegramService } from './TelegramService';

export class OrderExecutor {
  private dbClient: SupabaseClientManager;
  private exchanges: Map<string, IExchange> = new Map();
  private telegramService: TelegramService;

  constructor(exchanges: IExchange[]) {
    this.dbClient = SupabaseClientManager.getInstance();
    this.telegramService = TelegramService.getInstance();
    
    exchanges.forEach(exchange => {
      this.exchanges.set(exchange.getName(), exchange);
    });
  }

  public async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<string> {
    const strategyId = uuidv4();
    logger.info(`Executing arbitrage strategy ${strategyId} for ${opportunity.baseSymbol}`);

    try {
      // Pre-execution validation
      await this.validateExecution(opportunity);

      // Get exchange instances
      const longExchange = this.exchanges.get(opportunity.longExchange);
      const shortExchange = this.exchanges.get(opportunity.shortExchange);

      if (!longExchange || !shortExchange) {
        throw new Error(`Exchange not available: ${opportunity.longExchange} or ${opportunity.shortExchange}`);
      }

      // Calculate TP/SL levels
      const levels = this.calculateTPSL(opportunity);

      // Set leverage on both exchanges
      await this.setLeverage(opportunity, longExchange, shortExchange);

      // Set margin mode to isolated
      await this.setMarginMode(opportunity, longExchange, shortExchange);

      // Execute both legs simultaneously
      const [longResult, shortResult] = await Promise.allSettled([
        this.executeLongLeg(opportunity, longExchange, levels),
        this.executeShortLeg(opportunity, shortExchange, levels),
      ]);

      // Verify both legs executed successfully
      if (!this.verifyExecution(longResult, shortResult)) {
        await this.rollbackTrades(strategyId, longResult, shortResult);
        throw new Error('Failed to execute both legs successfully');
      }

      const longTrade = (longResult as PromiseFulfilledResult<TradeResult>).value;
      const shortTrade = (shortResult as PromiseFulfilledResult<TradeResult>).value;

      // Store positions in database
      await this.storePositions(strategyId, opportunity, longTrade, shortTrade);

      // Log successful execution
      logTrade({
        action: 'arbitrage_executed',
        strategyId,
        baseSymbol: opportunity.baseSymbol,
        longExchange: opportunity.longExchange,
        shortExchange: opportunity.shortExchange,
        longPrice: longTrade.price,
        shortPrice: shortTrade.price,
        size: longTrade.quantity,
        expectedProfitBps: opportunity.estimatedProfitBps,
        success: true,
      });

      logger.info(`Successfully executed arbitrage strategy ${strategyId}`);
      return strategyId;

    } catch (error) {
      logError(error as Error, { 
        context: 'executeArbitrage', 
        strategyId, 
        opportunity: opportunity.baseSymbol 
      });
      throw error;
    }
  }

  private async validateExecution(opportunity: ArbitrageOpportunity): Promise<void> {
    // Check if we have enough capital
    const requiredCapital = opportunity.requiredCapital;
    // TODO: Check available balance across exchanges

    // Check position limits
    // TODO: Implement position limit checks

    // Refresh order book to ensure opportunity still exists
    const longExchange = this.exchanges.get(opportunity.longExchange);
    const shortExchange = this.exchanges.get(opportunity.shortExchange);

    if (!longExchange || !shortExchange) {
      throw new Error('Exchanges not available');
    }

    // Quick orderbook refresh
    const [longOB, shortOB] = await Promise.all([
      longExchange.getOrderBook(opportunity.longSymbol, 10),
      shortExchange.getOrderBook(opportunity.shortSymbol, 10),
    ]);

    // Verify sufficient liquidity still exists
    if (longOB.asks.length === 0 || shortOB.bids.length === 0) {
      throw new Error('Insufficient liquidity for execution');
    }

    const longPrice = longOB.asks[0].price;
    const shortPrice = shortOB.bids[0].price;
    const priceSpread = (shortPrice - longPrice) / longPrice;

    if (priceSpread < 0.001) { // Less than 0.1% spread
      throw new Error('Price spread too narrow for profitable execution');
    }
  }

  private calculateTPSL(opportunity: ArbitrageOpportunity): TPSLLevels {
    // For funding arbitrage, we typically hold positions until funding collection
    // But we need safety levels to prevent large losses

    const longPrice = opportunity.longOrderBook.asks[0]?.price || 0;
    const shortPrice = opportunity.shortOrderBook.bids[0]?.price || 0;

    // Conservative TP/SL levels (2% moves)
    const tpPercentage = 0.02; // 2%
    const slPercentage = 0.05; // 5%

    return {
      // Long position: TP above entry, SL below entry
      longTP: longPrice * (1 + tpPercentage),
      longSL: longPrice * (1 - slPercentage),
      
      // Short position: TP below entry, SL above entry
      shortTP: shortPrice * (1 - tpPercentage),
      shortSL: shortPrice * (1 + slPercentage),
    };
  }

  private async setLeverage(
    opportunity: ArbitrageOpportunity, 
    longExchange: IExchange, 
    shortExchange: IExchange
  ): Promise<void> {
    try {
      await Promise.all([
        longExchange.setLeverage(opportunity.longSymbol, tradingParams.defaultLeverage),
        shortExchange.setLeverage(opportunity.shortSymbol, tradingParams.defaultLeverage),
      ]);
      
      logger.debug(`Set leverage to ${tradingParams.defaultLeverage}x for ${opportunity.baseSymbol}`);
    } catch (error) {
      logError(error as Error, { context: 'setLeverage', symbol: opportunity.baseSymbol });
      throw error;
    }
  }

  private async setMarginMode(
    opportunity: ArbitrageOpportunity, 
    longExchange: IExchange, 
    shortExchange: IExchange
  ): Promise<void> {
    try {
      await Promise.all([
        longExchange.setMarginMode(opportunity.longSymbol, true), // isolated = true
        shortExchange.setMarginMode(opportunity.shortSymbol, true),
      ]);
      
      logger.debug(`Set isolated margin mode for ${opportunity.baseSymbol}`);
    } catch (error) {
      logError(error as Error, { context: 'setMarginMode', symbol: opportunity.baseSymbol });
      // Don't throw - margin mode setting might not be critical
    }
  }

  private async executeLongLeg(
    opportunity: ArbitrageOpportunity, 
    exchange: IExchange, 
    levels: TPSLLevels
  ): Promise<TradeResult> {
    const order: TradeOrder = {
      symbol: opportunity.longSymbol,
      side: 'buy',
      quantity: opportunity.maxSize,
      orderType: 'IOC', // Immediate or Cancel
      timeInForce: 'IOC',
      reduceOnly: false,
    };

    return await retryWithBackoff(
      () => exchange.executeTrade(order),
      tradingParams.retryAttempts,
      tradingParams.retryDelayMs
    );
  }

  private async executeShortLeg(
    opportunity: ArbitrageOpportunity, 
    exchange: IExchange, 
    levels: TPSLLevels
  ): Promise<TradeResult> {
    const order: TradeOrder = {
      symbol: opportunity.shortSymbol,
      side: 'sell',
      quantity: opportunity.maxSize,
      orderType: 'IOC', // Immediate or Cancel
      timeInForce: 'IOC',
      reduceOnly: false,
    };

    return await retryWithBackoff(
      () => exchange.executeTrade(order),
      tradingParams.retryAttempts,
      tradingParams.retryDelayMs
    );
  }

  private verifyExecution(
    longResult: PromiseSettledResult<TradeResult>, 
    shortResult: PromiseSettledResult<TradeResult>
  ): boolean {
    if (longResult.status === 'rejected' || shortResult.status === 'rejected') {
      logger.error('One or both trade legs failed');
      return false;
    }

    const longTrade = longResult.value;
    const shortTrade = shortResult.value;

    // Check if both orders were filled
    if (longTrade.status !== 'filled' || shortTrade.status !== 'filled') {
      logger.error('One or both orders were not filled completely');
      return false;
    }

    // Check quantity matching (allow for small differences due to min size requirements)
    const quantityDiff = Math.abs(longTrade.quantity - shortTrade.quantity);
    const maxAllowedDiff = Math.min(longTrade.quantity, shortTrade.quantity) * 0.05; // 5% tolerance

    if (quantityDiff > maxAllowedDiff) {
      logger.error(`Quantity mismatch: long=${longTrade.quantity}, short=${shortTrade.quantity}`);
      return false;
    }

    return true;
  }

  private async rollbackTrades(
    strategyId: string,
    longResult: PromiseSettledResult<TradeResult>,
    shortResult: PromiseSettledResult<TradeResult>
  ): Promise<void> {
    logger.warn(`Rolling back trades for strategy ${strategyId}`);

    const rollbackTasks = [];

    // Close any filled positions
    if (longResult.status === 'fulfilled' && longResult.value.status === 'filled') {
      const longExchange = this.exchanges.get(longResult.value.symbol.split('/')[0]); // Simplified
      if (longExchange) {
        rollbackTasks.push(
          longExchange.closePosition(longResult.value.symbol, longResult.value.quantity)
        );
      }
    }

    if (shortResult.status === 'fulfilled' && shortResult.value.status === 'filled') {
      const shortExchange = this.exchanges.get(shortResult.value.symbol.split('/')[0]); // Simplified
      if (shortExchange) {
        rollbackTasks.push(
          shortExchange.closePosition(shortResult.value.symbol, shortResult.value.quantity)
        );
      }
    }

    await Promise.allSettled(rollbackTasks);
  }

  private async storePositions(
    strategyId: string, 
    opportunity: ArbitrageOpportunity, 
    longTrade: TradeResult, 
    shortTrade: TradeResult
  ): Promise<void> {
    try {
      // Store individual trades
      await Promise.all([
        this.storeTrade(strategyId, longTrade, tradingParams.defaultLeverage),
        this.storeTrade(strategyId, shortTrade, tradingParams.defaultLeverage),
      ]);

      // Get current positions from exchanges to get liquidation prices
      const longExchange = this.exchanges.get(opportunity.longExchange);
      const shortExchange = this.exchanges.get(opportunity.shortExchange);

      if (longExchange && shortExchange) {
        const [longPosition, shortPosition] = await Promise.all([
          longExchange.getPosition(opportunity.longSymbol),
          shortExchange.getPosition(opportunity.shortSymbol),
        ]);

        // Store positions
        if (longPosition && shortPosition) {
          await Promise.all([
            this.storePosition(strategyId, longPosition),
            this.storePosition(strategyId, shortPosition),
          ]);
        }
      }

      // Store strategy performance record
      await this.storeStrategyPerformance(strategyId, opportunity, longTrade, shortTrade);

      logger.debug(`Stored positions for strategy ${strategyId}`);
    } catch (error) {
      logError(error as Error, { context: 'storePositions', strategyId });
    }
  }

  private async storeTrade(
    strategyId: string, 
    trade: TradeResult, 
    leverage: number
  ): Promise<void> {
    const { data, error } = await this.dbClient.getClient()
      .from('trades')
      .insert({
        strategy_id: strategyId,
        exchange: trade.symbol.includes('bybit') ? 'bybit' : 'unknown', // Simplified
        symbol: trade.symbol,
        side: trade.side,
        price: trade.price,
        quantity: trade.quantity,
        leverage,
        order_type: 'IOC',
        status: trade.status,
        fees: trade.fees,
      });

    if (error) {
      throw new Error(`Failed to store trade: ${error.message}`);
    }
  }

  private async storePosition(strategyId: string, position: Position): Promise<void> {
    const { data, error } = await this.dbClient.getClient()
      .from('positions')
      .insert({
        strategy_id: strategyId,
        exchange: position.exchange,
        symbol: position.symbol,
        side: position.side,
        entry_price: position.entryPrice,
        quantity: position.size,
        leverage: position.leverage,
        liquidation_price: position.liquidationPrice,
        status: 'active',
      });

    if (error) {
      throw new Error(`Failed to store position: ${error.message}`);
    }
  }

  private async storeStrategyPerformance(
    strategyId: string, 
    opportunity: ArbitrageOpportunity, 
    longTrade: TradeResult, 
    shortTrade: TradeResult
  ): Promise<void> {
    const { data, error } = await this.dbClient.getClient()
      .from('strategy_performance')
      .insert({
        strategy_id: strategyId,
        base_symbol: opportunity.baseSymbol,
        long_exchange: opportunity.longExchange,
        short_exchange: opportunity.shortExchange,
        entry_time: new Date(),
        expected_profit_bps: opportunity.estimatedProfitBps,
        status: 'active',
      });

    if (error) {
      throw new Error(`Failed to store strategy performance: ${error.message}`);
    }
  }

  public async closeStrategy(strategyId: string, reason: string = 'manual'): Promise<boolean> {
    try {
      logger.info(`Closing strategy ${strategyId}, reason: ${reason}`);

      // Get all active positions for this strategy
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('*')
        .eq('strategy_id', strategyId)
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        logger.warn(`No active positions found for strategy ${strategyId}`);
        return true;
      }

      let totalPnl = 0;

      // Close all positions
      const closeTasks = positions.map(async (pos) => {
        const exchange = this.exchanges.get(pos.exchange);
        if (exchange) {
          try {
            const closeResult = await exchange.closePosition(pos.symbol, pos.quantity);
            if (closeResult) {
              // Get the latest position info to calculate PnL
              const positionInfo = await exchange.getPosition(pos.symbol);
              if (positionInfo) {
                totalPnl += positionInfo.unrealizedPnl || 0;
                
                // Update position status
                await this.dbClient.getClient()
                  .from('positions')
                  .update({ 
                    status: 'closed',
                    exit_price: positionInfo.markPrice,
                    exit_time: new Date(),
                    realized_pnl: positionInfo.unrealizedPnl
                  })
                  .eq('id', pos.id);
              }
            }
          } catch (error) {
            logError(error as Error, { 
              context: 'closePosition', 
              strategyId,
              symbol: pos.symbol,
              exchange: pos.exchange
            });
          }
        }
      });

      await Promise.allSettled(closeTasks);

      // Update strategy performance
      await this.dbClient.getClient()
        .from('strategy_performance')
        .update({ 
          status: 'closed', 
          exit_time: new Date(),
          total_pnl: totalPnl
        })
        .eq('strategy_id', strategyId);

      // Send trade closure alert
      await this.telegramService.sendTradeAlert({
        strategyId,
        symbol: positions[0].symbol,
        type: 'close',
        pnl: totalPnl
      });

      logger.info(`Successfully closed strategy ${strategyId}`);
      return true;

    } catch (error) {
      logError(error as Error, { context: 'closeStrategy', strategyId });
      return false;
    }
  }
} 