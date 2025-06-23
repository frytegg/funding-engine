import { IExchange } from '../exchanges/interfaces/IExchange';
import { SupabaseClientManager } from '../database/supabase.client';
import { OrderExecutor } from './OrderExecutor';
import { Position } from '../types/common';
import { logger, logError, logKillSwitch } from '../utils/logger';
import { tradingParams, arbitrageConfig } from '../config/arbitrage.config';
import { sleep } from '../utils/helpers';

export interface PositionMonitorConfig {
  checkIntervalMs: number;
  killSwitchThresholds: {
    nearLiquidationPercent: number;
    maxDrawdownPercent: number;
  };
}

export class PositionMonitor {
  private dbClient: SupabaseClientManager;
  private exchanges: Map<string, IExchange> = new Map();
  private orderExecutor: OrderExecutor;
  private isRunning = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private config: PositionMonitorConfig;

  constructor(exchanges: IExchange[], orderExecutor: OrderExecutor) {
    this.dbClient = SupabaseClientManager.getInstance();
    this.orderExecutor = orderExecutor;
    
    exchanges.forEach(exchange => {
      this.exchanges.set(exchange.getName(), exchange);
    });

    this.config = {
      checkIntervalMs: tradingParams.positionCheckIntervalMs,
      killSwitchThresholds: arbitrageConfig.killSwitchThresholds,
    };
  }

  public start(): void {
    if (this.isRunning) {
      logger.warn('PositionMonitor is already running');
      return;
    }

    logger.info('Starting PositionMonitor service');
    this.isRunning = true;

    // Start monitoring loop
    this.monitoringInterval = setInterval(() => {
      if (this.isRunning) {
        this.checkAllPositions().catch(error => {
          logError(error as Error, { context: 'positionMonitor' });
        });
      }
    }, this.config.checkIntervalMs);

    // Run initial check
    this.checkAllPositions().catch(error => {
      logError(error as Error, { context: 'positionMonitor_initial' });
    });
  }

  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isRunning = false;
    logger.info('PositionMonitor service stopped');
  }

  private async checkAllPositions(): Promise<void> {
    try {
      logger.debug('Starting position monitoring cycle');

      // Get all active strategies from database
      const { data: strategies, error } = await this.dbClient.getClient()
        .from('strategy_performance')
        .select('strategy_id, base_symbol, long_exchange, short_exchange')
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch active strategies: ${error.message}`);
      }

      if (!strategies || strategies.length === 0) {
        logger.debug('No active strategies to monitor');
        return;
      }

      // Check each strategy
      const checkTasks = strategies.map(strategy => 
        this.checkStrategy(strategy.strategy_id)
      );

      await Promise.allSettled(checkTasks);

      logger.debug(`Monitored ${strategies.length} active strategies`);

    } catch (error) {
      logError(error as Error, { context: 'checkAllPositions' });
    }
  }

  private async checkStrategy(strategyId: string): Promise<void> {
    try {
      // Get all positions for this strategy
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('*')
        .eq('strategy_id', strategyId)
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch positions for strategy ${strategyId}: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        logger.debug(`No active positions for strategy ${strategyId}`);
        return;
      }

      // Check each position
      for (const position of positions) {
        await this.checkPosition(strategyId, position);
      }

      // Check overall strategy health
      await this.checkStrategyHealth(strategyId, positions);

    } catch (error) {
      logError(error as Error, { context: 'checkStrategy', strategyId });
    }
  }

  private async checkPosition(strategyId: string, dbPosition: any): Promise<void> {
    try {
      const exchange = this.exchanges.get(dbPosition.exchange);
      if (!exchange) {
        logger.warn(`Exchange ${dbPosition.exchange} not available for position check`);
        return;
      }

      // Get current position from exchange
      const currentPosition = await exchange.getPosition(dbPosition.symbol);
      
      if (!currentPosition) {
        // Position closed on exchange but still active in DB
        logger.warn(`Position ${dbPosition.symbol} closed on ${dbPosition.exchange} but still active in DB`);
        await this.executeKillSwitch(strategyId, 'position_closed_externally');
        return;
      }

      // Update position in database with current data
      await this.updatePositionInDb(dbPosition.id, currentPosition);

      // Check for kill switch conditions
      await this.checkKillSwitchConditions(strategyId, currentPosition, dbPosition);

    } catch (error) {
      logError(error as Error, { 
        context: 'checkPosition', 
        strategyId, 
        exchange: dbPosition.exchange,
        symbol: dbPosition.symbol 
      });
    }
  }

  private async checkKillSwitchConditions(
    strategyId: string, 
    currentPosition: Position, 
    dbPosition: any
  ): Promise<void> {
    // Check 1: Near liquidation
    if (await this.isNearLiquidation(currentPosition)) {
      await this.executeKillSwitch(strategyId, 'near_liquidation');
      return;
    }

    // Check 2: Excessive unrealized loss
    const unrealizedLossPercent = this.calculateUnrealizedLossPercent(currentPosition, dbPosition);
    if (unrealizedLossPercent > this.config.killSwitchThresholds.maxDrawdownPercent) {
      await this.executeKillSwitch(strategyId, 'max_drawdown_exceeded');
      return;
    }

    // Check 3: Margin ratio too high
    const exchange = this.exchanges.get(currentPosition.exchange);
    if (exchange) {
      const marginRatio = await exchange.getMarginRatio();
      if (marginRatio > 0.8) { // 80% margin utilization
        await this.executeKillSwitch(strategyId, 'high_margin_ratio');
        return;
      }
    }
  }

  private async isNearLiquidation(position: Position): Promise<boolean> {
    if (!position.liquidationPrice || position.liquidationPrice === 0) {
      return false;
    }

    const currentPrice = position.markPrice;
    const liquidationPrice = position.liquidationPrice;
    
    let distanceToLiquidation: number;
    
    if (position.side === 'long') {
      // For long positions, liquidation happens when price drops
      distanceToLiquidation = (currentPrice - liquidationPrice) / currentPrice;
    } else {
      // For short positions, liquidation happens when price rises
      distanceToLiquidation = (liquidationPrice - currentPrice) / currentPrice;
    }

    const thresholdPercent = this.config.killSwitchThresholds.nearLiquidationPercent / 100;
    
    return distanceToLiquidation < thresholdPercent;
  }

  private calculateUnrealizedLossPercent(currentPosition: Position, dbPosition: any): number {
    const entryPrice = dbPosition.entry_price;
    const currentPrice = currentPosition.markPrice;
    const side = dbPosition.side;

    let pnlPercent: number;

    if (side === 'long') {
      pnlPercent = (currentPrice - entryPrice) / entryPrice;
    } else {
      pnlPercent = (entryPrice - currentPrice) / entryPrice;
    }

    // Return absolute loss percentage (positive number for losses)
    return pnlPercent < 0 ? Math.abs(pnlPercent) * 100 : 0;
  }

  private async checkStrategyHealth(strategyId: string, positions: any[]): Promise<void> {
    try {
      // Check if one leg of the arbitrage is missing
      const exchanges = new Set(positions.map(p => p.exchange));
      
      if (positions.length === 1 || exchanges.size === 1) {
        // Only one position remaining - this breaks the arbitrage
        logger.warn(`Strategy ${strategyId} has only one leg remaining`);
        await this.executeKillSwitch(strategyId, 'incomplete_arbitrage');
        return;
      }

      // Check for significant size mismatches
      if (positions.length === 2) {
        const [pos1, pos2] = positions;
        const sizeDiff = Math.abs(pos1.quantity - pos2.quantity);
        const avgSize = (pos1.quantity + pos2.quantity) / 2;
        const sizeMismatchPercent = (sizeDiff / avgSize) * 100;

        if (sizeMismatchPercent > 20) { // 20% size mismatch
          logger.warn(`Strategy ${strategyId} has significant size mismatch: ${sizeMismatchPercent.toFixed(2)}%`);
          await this.executeKillSwitch(strategyId, 'size_mismatch');
          return;
        }
      }

    } catch (error) {
      logError(error as Error, { context: 'checkStrategyHealth', strategyId });
    }
  }

  private async executeKillSwitch(strategyId: string, reason: string): Promise<void> {
    try {
      logger.warn(`Executing kill switch for strategy ${strategyId}, reason: ${reason}`);

      // Log kill switch activation
      logKillSwitch({
        strategyId,
        reason,
        timestamp: new Date(),
        action: 'kill_switch_activated',
      });

      // Close the strategy using OrderExecutor
      const success = await this.orderExecutor.closeStrategy(strategyId, reason);

      if (success) {
        logger.info(`Kill switch executed successfully for strategy ${strategyId}`);
        
        // Update strategy status
        await this.dbClient.getClient()
          .from('strategy_performance')
          .update({ 
            status: 'killed',
            exit_time: new Date()
          })
          .eq('strategy_id', strategyId);

      } else {
        logger.error(`Kill switch execution failed for strategy ${strategyId}`);
      }

    } catch (error) {
      logError(error as Error, { 
        context: 'executeKillSwitch', 
        strategyId, 
        reason 
      });
    }
  }

  private async updatePositionInDb(positionId: number, currentPosition: Position): Promise<void> {
    try {
      await this.dbClient.getClient()
        .from('positions')
        .update({
          liquidation_price: currentPosition.liquidationPrice,
          updated_at: new Date(),
        })
        .eq('id', positionId);

    } catch (error) {
      logError(error as Error, { context: 'updatePositionInDb', positionId });
    }
  }

  public async getMonitoringStatus(): Promise<{
    isRunning: boolean;
    activeStrategies: number;
    activePositions: number;
    lastCheckTime: Date;
  }> {
    try {
      // Get count of active strategies
      const { count: strategyCount } = await this.dbClient.getClient()
        .from('strategy_performance')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get count of active positions
      const { count: positionCount } = await this.dbClient.getClient()
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      return {
        isRunning: this.isRunning,
        activeStrategies: strategyCount || 0,
        activePositions: positionCount || 0,
        lastCheckTime: new Date(),
      };

    } catch (error) {
      logError(error as Error, { context: 'getMonitoringStatus' });
      return {
        isRunning: this.isRunning,
        activeStrategies: 0,
        activePositions: 0,
        lastCheckTime: new Date(),
      };
    }
  }

  public async forceCloseStrategy(strategyId: string): Promise<boolean> {
    try {
      logger.info(`Force closing strategy ${strategyId}`);
      await this.executeKillSwitch(strategyId, 'manual_force_close');
      return true;
    } catch (error) {
      logError(error as Error, { context: 'forceCloseStrategy', strategyId });
      return false;
    }
  }

  public async pauseMonitoring(): Promise<void> {
    logger.info('Pausing position monitoring');
    this.isRunning = false;
  }

  public async resumeMonitoring(): Promise<void> {
    logger.info('Resuming position monitoring');
    this.isRunning = true;
  }
} 