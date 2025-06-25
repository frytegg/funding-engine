import { IExchange } from '../exchanges/interfaces/IExchange';
import { ArbitrageOpportunity, TradeOrder, TradeResult, Position, TPSLLevels } from '../types/common';
import { supabaseClient } from '../database/supabase.client';
import { Logger } from '../utils/logger';
import { 
  generateUUID, 
  calculateLiquidationPrice, 
  sleep 
} from '../utils/helpers';

export class OrderExecutor {
  private logger: Logger;
  private exchanges: Map<string, IExchange> = new Map();

  constructor() {
    this.logger = new Logger('OrderExecutor');
  }

  public addExchange(exchange: IExchange): void {
    this.exchanges.set(exchange.getName(), exchange);
    this.logger.info(`Added exchange: ${exchange.getName()}`);
  }

  public async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<string> {
    const strategyId = generateUUID();
    this.logger.info(`Executing arbitrage strategy ${strategyId} for ${opportunity.symbol}`);

    try {
      // 1. Get exchange instances
      const longExchange = this.exchanges.get(opportunity.longExchange);
      const shortExchange = this.exchanges.get(opportunity.shortExchange);

      if (!longExchange || !shortExchange) {
        throw new Error(`Exchange not available: ${opportunity.longExchange} or ${opportunity.shortExchange}`);
      }

      // 2. Set leverage on both exchanges
      await this.setLeverage(opportunity, longExchange, shortExchange);

      // 3. Calculate TP/SL levels
      const levels = this.calculateTPSL(opportunity);

      // 4. Execute both legs simultaneously (IOC orders)
      const [longResult, shortResult] = await Promise.all([
        this.executeLongLeg(opportunity, longExchange, strategyId),
        this.executeShortLeg(opportunity, shortExchange, strategyId)
      ]);

      // 5. Verify both legs filled
      if (!this.verifyExecution(longResult, shortResult)) {
        await this.rollbackTrades(strategyId, longResult, shortResult);
        throw new Error('Failed to execute both legs - positions rolled back');
      }

      // 6. Store positions in database
      await this.storePositions(strategyId, longResult, shortResult, levels);

      // 7. Update opportunity status
      await this.updateOpportunityStatus(opportunity, strategyId, 'executed');

      this.logger.info(`Successfully executed arbitrage strategy ${strategyId}`);
      return strategyId;

    } catch (error) {
      this.logger.error(`Failed to execute arbitrage strategy ${strategyId}:`, error);
      await this.updateOpportunityStatus(opportunity, strategyId, 'rejected');
      throw error;
    }
  }

  private async setLeverage(
    opportunity: ArbitrageOpportunity,
    longExchange: IExchange,
    shortExchange: IExchange
  ): Promise<void> {
    const defaultLeverage = 5; // Conservative leverage for arbitrage

    try {
      await Promise.all([
        longExchange.setLeverage(opportunity.symbol, defaultLeverage),
        shortExchange.setLeverage(opportunity.symbol, defaultLeverage)
      ]);

      this.logger.debug(`Set leverage to ${defaultLeverage}x on both exchanges for ${opportunity.symbol}`);
    } catch (error) {
      this.logger.error('Failed to set leverage:', error);
      throw error;
    }
  }

  private calculateTPSL(opportunity: ArbitrageOpportunity): TPSLLevels {
    // For funding rate arbitrage, we typically hold until funding reverses
    // Set conservative TP/SL levels to protect against adverse movements

    const currentPrice = 50000; // This should be fetched from market data
    const stopLossPercent = 0.02; // 2% stop loss
    const takeProfitPercent = 0.05; // 5% take profit (when funding rates converge)

    return {
      longTP: currentPrice * (1 + takeProfitPercent),
      longSL: currentPrice * (1 - stopLossPercent),
      shortTP: currentPrice * (1 - takeProfitPercent),
      shortSL: currentPrice * (1 + stopLossPercent),
    };
  }

  private async executeLongLeg(
    opportunity: ArbitrageOpportunity,
    exchange: IExchange,
    strategyId: string
  ): Promise<TradeResult> {
    const order: TradeOrder = {
      symbol: opportunity.symbol,
      side: 'buy',
      type: 'ioc', // Immediate-or-Cancel
      quantity: opportunity.optimalSize,
      leverage: 5,
    };

    this.logger.info(`Executing long leg on ${opportunity.longExchange} for ${order.quantity} ${opportunity.symbol}`);

    const result = await exchange.executeTrade(order);
    
    // Store trade record
    await this.storeTrade(result, strategyId);

    return result;
  }

  private async executeShortLeg(
    opportunity: ArbitrageOpportunity,
    exchange: IExchange,
    strategyId: string
  ): Promise<TradeResult> {
    const order: TradeOrder = {
      symbol: opportunity.symbol,
      side: 'sell',
      type: 'ioc', // Immediate-or-Cancel
      quantity: opportunity.optimalSize,
      leverage: 5,
    };

    this.logger.info(`Executing short leg on ${opportunity.shortExchange} for ${order.quantity} ${opportunity.symbol}`);

    const result = await exchange.executeTrade(order);
    
    // Store trade record
    await this.storeTrade(result, strategyId);

    return result;
  }

  private verifyExecution(longResult: TradeResult, shortResult: TradeResult): boolean {
    const longFilled = longResult.status === 'filled';
    const shortFilled = shortResult.status === 'filled';

    if (!longFilled || !shortFilled) {
      this.logger.warn(`Execution verification failed - Long: ${longResult.status}, Short: ${shortResult.status}`);
      return false;
    }

    // Verify quantities match (within tolerance)
    const tolerance = 0.01; // 1% tolerance
    const quantityDiff = Math.abs(longResult.quantity - shortResult.quantity);
    const avgQuantity = (longResult.quantity + shortResult.quantity) / 2;
    
    if (quantityDiff / avgQuantity > tolerance) {
      this.logger.warn(`Quantity mismatch - Long: ${longResult.quantity}, Short: ${shortResult.quantity}`);
      return false;
    }

    return true;
  }

  private async rollbackTrades(
    strategyId: string,
    longResult?: TradeResult,
    shortResult?: TradeResult
  ): Promise<void> {
    this.logger.warn(`Rolling back trades for strategy ${strategyId}`);

    const rollbackPromises: Promise<any>[] = [];

    // Close any filled positions
    if (longResult?.status === 'filled') {
      const longExchange = this.exchanges.get(longResult.exchange);
      if (longExchange) {
        rollbackPromises.push(longExchange.closePosition(longResult.symbol));
      }
    }

    if (shortResult?.status === 'filled') {
      const shortExchange = this.exchanges.get(shortResult.exchange);
      if (shortExchange) {
        rollbackPromises.push(shortExchange.closePosition(shortResult.symbol));
      }
    }

    try {
      await Promise.all(rollbackPromises);
      this.logger.info(`Successfully rolled back positions for strategy ${strategyId}`);
    } catch (error) {
      this.logger.error(`Failed to rollback positions for strategy ${strategyId}:`, error);
    }
  }

  private async storePositions(
    strategyId: string,
    longResult: TradeResult,
    shortResult: TradeResult,
    levels: TPSLLevels
  ): Promise<void> {
    try {
      const positions = [
        {
          strategy_id: strategyId,
          exchange: longResult.exchange,
          symbol: longResult.symbol,
          side: 'long',
          entry_price: longResult.price,
          quantity: longResult.quantity,
          leverage: 5,
          liquidation_price: calculateLiquidationPrice(longResult.price, 5, 'long'),
          unrealized_pnl: 0,
          status: 'open',
        },
        {
          strategy_id: strategyId,
          exchange: shortResult.exchange,
          symbol: shortResult.symbol,
          side: 'short',
          entry_price: shortResult.price,
          quantity: shortResult.quantity,
          leverage: 5,
          liquidation_price: calculateLiquidationPrice(shortResult.price, 5, 'short'),
          unrealized_pnl: 0,
          status: 'open',
        }
      ];

      const { error } = await supabaseClient
        .from('positions')
        .insert(positions);

      if (error) {
        throw new Error(`Failed to store positions: ${error.message}`);
      }

      this.logger.info(`Stored positions for strategy ${strategyId}`);
    } catch (error) {
      this.logger.error('Failed to store positions:', error);
      throw error;
    }
  }

  private async storeTrade(result: TradeResult, strategyId: string): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from('trades')
        .insert({
          order_id: result.orderId,
          strategy_id: strategyId,
          exchange: result.exchange,
          symbol: result.symbol,
          side: result.side,
          price: result.price,
          quantity: result.quantity,
          leverage: 5,
          order_type: 'ioc',
          status: result.status,
          fees: result.fees,
        });

      if (error) {
        throw new Error(`Failed to store trade: ${error.message}`);
      }
    } catch (error) {
      this.logger.error('Failed to store trade:', error);
    }
  }

  private async updateOpportunityStatus(
    opportunity: ArbitrageOpportunity,
    strategyId: string,
    status: 'executed' | 'rejected'
  ): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from('arbitrage_opportunities')
        .update({
          strategy_id: strategyId,
          status,
          executed_at: status === 'executed' ? new Date().toISOString() : null,
        })
        .eq('symbol', opportunity.symbol)
        .eq('long_exchange', opportunity.longExchange)
        .eq('short_exchange', opportunity.shortExchange)
        .eq('status', 'identified');

      if (error) {
        throw new Error(`Failed to update opportunity status: ${error.message}`);
      }
    } catch (error) {
      this.logger.error('Failed to update opportunity status:', error);
    }
  }

  public async closeStrategy(strategyId: string, reason: string = 'manual'): Promise<void> {
    this.logger.info(`Closing strategy ${strategyId} - Reason: ${reason}`);

    try {
      // Get all open positions for this strategy
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('strategy_id', strategyId)
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        this.logger.warn(`No open positions found for strategy ${strategyId}`);
        return;
      }

      // Close all positions
      const closePromises = positions.map(async (position) => {
        const exchange = this.exchanges.get(position.exchange);
        if (exchange) {
          await exchange.closePosition(position.symbol);
          
          // Update position status in database
          await supabaseClient
            .from('positions')
            .update({ status: 'closed' })
            .eq('id', position.id);
        }
      });

      await Promise.all(closePromises);

      this.logger.info(`Successfully closed strategy ${strategyId}`);
    } catch (error) {
      this.logger.error(`Failed to close strategy ${strategyId}:`, error);
      throw error;
    }
  }
} 