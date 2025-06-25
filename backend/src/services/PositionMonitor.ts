import { IExchange } from '../exchanges/interfaces/IExchange';
import { Position } from '../types/common';
import { supabaseClient } from '../database/supabase.client';
import { arbitrageConfig } from '../config/arbitrage.config';
import { Logger } from '../utils/logger';
import { sleep } from '../utils/helpers';

export class PositionMonitor {
  private logger: Logger;
  private exchanges: Map<string, IExchange> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor() {
    this.logger = new Logger('PositionMonitor');
  }

  public addExchange(exchange: IExchange): void {
    this.exchanges.set(exchange.getName(), exchange);
    this.logger.info(`Added exchange: ${exchange.getName()}`);
  }

  public start(): void {
    if (this.isMonitoring) {
      this.logger.warn('Position monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.logger.info('Starting position monitoring');

    this.monitoringInterval = setInterval(() => {
      this.checkAllPositions().catch(error => {
        this.logger.error('Error in position monitoring cycle:', error);
      });
    }, 5000); // Check every 5 seconds
  }

  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    this.logger.info('Stopped position monitoring');
  }

  private async checkAllPositions(): Promise<void> {
    try {
      // Get all open positions from database
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return; // No positions to monitor
      }

      // Group positions by strategy
      const strategiesMap = new Map<string, any[]>();
      for (const position of positions) {
        const strategyId = position.strategy_id;
        if (!strategiesMap.has(strategyId)) {
          strategiesMap.set(strategyId, []);
        }
        strategiesMap.get(strategyId)!.push(position);
      }

      // Monitor each strategy
      for (const [strategyId, strategyPositions] of strategiesMap) {
        await this.checkStrategy(strategyId, strategyPositions);
      }

    } catch (error) {
      this.logger.error('Failed to check positions:', error);
    }
  }

  private async checkStrategy(strategyId: string, positions: any[]): Promise<void> {
    try {
      // Check if both legs are still open
      if (positions.length !== 2) {
        this.logger.warn(`Strategy ${strategyId} has ${positions.length} positions (expected 2)`);
        
        if (positions.length === 1) {
          // One leg closed - emergency close the other
          await this.executeKillSwitch(strategyId, 'Single leg detected - closing remaining position');
        }
        return;
      }

      // Update position data from exchanges
      const updatedPositions = await this.updatePositionData(positions);

      // Check kill switch conditions
      for (const position of updatedPositions) {
        const killSwitchReason = this.evaluateKillSwitchConditions(position);
        if (killSwitchReason) {
          await this.executeKillSwitch(strategyId, killSwitchReason);
          return;
        }
      }

      // Update positions in database
      await this.updatePositionsInDatabase(updatedPositions);

      this.logger.debug(`Monitored strategy ${strategyId} - ${positions.length} positions`);

    } catch (error) {
      this.logger.error(`Failed to check strategy ${strategyId}:`, error);
    }
  }

  private async updatePositionData(positions: any[]): Promise<any[]> {
    const updatedPositions = [];

    for (const position of positions) {
      try {
        const exchange = this.exchanges.get(position.exchange);
        if (!exchange) {
          this.logger.warn(`Exchange ${position.exchange} not available for position update`);
          updatedPositions.push(position);
          continue;
        }

        // Get current position data from exchange
        const currentPosition = await exchange.getPosition(position.symbol);
        
        if (!currentPosition) {
          // Position no longer exists on exchange
          this.logger.warn(`Position for ${position.symbol} not found on ${position.exchange}`);
          position.status = 'closed';
          updatedPositions.push(position);
          continue;
        }

        // Update position with current data
        const updatedPosition = {
          ...position,
          current_price: currentPosition.entryPrice, // Should be current mark price
          unrealized_pnl: currentPosition.unrealizedPnl,
          liquidation_price: currentPosition.liquidationPrice,
          updated_at: new Date().toISOString(),
        };

        updatedPositions.push(updatedPosition);

      } catch (error) {
        this.logger.error(`Failed to update position data for ${position.exchange}:${position.symbol}:`, error);
        updatedPositions.push(position);
      }
    }

    return updatedPositions;
  }

  private evaluateKillSwitchConditions(position: any): string | null {
    // Check proximity to liquidation
    if (this.isNearLiquidation(position)) {
      return `Position near liquidation - Distance: ${this.calculateLiquidationDistance(position)}%`;
    }

    // Check drawdown
    const drawdown = this.calculateDrawdown(position);
    if (drawdown > arbitrageConfig.killSwitchThresholds.maxDrawdownPercent) {
      return `Max drawdown exceeded - Current: ${drawdown.toFixed(2)}%`;
    }

    // Check if position size is too large (safety check)
    const positionValue = position.quantity * (position.current_price || position.entry_price);
    if (positionValue > arbitrageConfig.maxPositionSize * 1.2) { // 20% tolerance
      return `Position size exceeded limit - Current: $${positionValue}`;
    }

    return null; // No kill switch conditions met
  }

  private isNearLiquidation(position: any): boolean {
    const liquidationDistance = this.calculateLiquidationDistance(position);
    return liquidationDistance < arbitrageConfig.killSwitchThresholds.nearLiquidationPercent;
  }

  private calculateLiquidationDistance(position: any): number {
    const currentPrice = position.current_price || position.entry_price;
    const liquidationPrice = position.liquidation_price;
    
    if (!liquidationPrice || liquidationPrice === 0) return 100; // Safe default

    if (position.side === 'long') {
      return ((currentPrice - liquidationPrice) / currentPrice) * 100;
    } else {
      return ((liquidationPrice - currentPrice) / currentPrice) * 100;
    }
  }

  private calculateDrawdown(position: any): number {
    const unrealizedPnl = position.unrealized_pnl || 0;
    const positionValue = position.quantity * position.entry_price;
    
    if (positionValue === 0) return 0;
    
    // Only calculate drawdown for losses
    if (unrealizedPnl >= 0) return 0;
    
    return Math.abs(unrealizedPnl / positionValue) * 100;
  }

  private async executeKillSwitch(strategyId: string, reason: string): Promise<void> {
    this.logger.warn(`🚨 KILL SWITCH ACTIVATED for strategy ${strategyId}: ${reason}`);

    try {
      // Get all open positions for this strategy
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('strategy_id', strategyId)
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch positions for kill switch: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        this.logger.warn(`No open positions found for strategy ${strategyId}`);
        return;
      }

      // Close all positions immediately
      const closePromises = positions.map(async (position) => {
        try {
          const exchange = this.exchanges.get(position.exchange);
          if (!exchange) {
            this.logger.error(`Exchange ${position.exchange} not available for kill switch`);
            return;
          }

          await exchange.closePosition(position.symbol);
          
          // Update position status in database
          await supabaseClient
            .from('positions')
            .update({ 
              status: 'closed',
              updated_at: new Date().toISOString()
            })
            .eq('id', position.id);

          this.logger.info(`Closed position: ${position.exchange}:${position.symbol}`);

        } catch (error) {
          this.logger.error(`Failed to close position ${position.exchange}:${position.symbol}:`, error);
        }
      });

      await Promise.all(closePromises);

      // Log kill switch event
      await this.logKillSwitchEvent(strategyId, reason);

      this.logger.warn(`Kill switch completed for strategy ${strategyId}`);

    } catch (error) {
      this.logger.error(`Failed to execute kill switch for strategy ${strategyId}:`, error);
    }
  }

  private async updatePositionsInDatabase(positions: any[]): Promise<void> {
    for (const position of positions) {
      try {
        await supabaseClient
          .from('positions')
          .update({
            current_price: position.current_price,
            unrealized_pnl: position.unrealized_pnl,
            liquidation_price: position.liquidation_price,
            status: position.status,
            updated_at: position.updated_at,
          })
          .eq('id', position.id);

      } catch (error) {
        this.logger.error(`Failed to update position ${position.id} in database:`, error);
      }
    }
  }

  private async logKillSwitchEvent(strategyId: string, reason: string): Promise<void> {
    try {
      await supabaseClient
        .from('system_logs')
        .insert({
          level: 'warn',
          message: `Kill switch activated: ${reason}`,
          metadata: { strategyId, reason },
          source: 'PositionMonitor',
        });
    } catch (error) {
      this.logger.error('Failed to log kill switch event:', error);
    }
  }

  public async getActiveStrategies(): Promise<string[]> {
    try {
      const { data, error } = await supabaseClient
        .from('positions')
        .select('strategy_id')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch active strategies: ${error.message}`);
      }

      const uniqueStrategies = [...new Set(data?.map(p => p.strategy_id) || [])];
      return uniqueStrategies;

    } catch (error) {
      this.logger.error('Failed to get active strategies:', error);
      return [];
    }
  }

  public async getPositionMetrics(strategyId: string): Promise<any> {
    try {
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('strategy_id', strategyId);

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return null;
      }

      const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
      const totalPositionValue = positions.reduce((sum, pos) => 
        sum + (pos.quantity * pos.entry_price), 0);

      return {
        strategyId,
        positionCount: positions.length,
        totalUnrealizedPnl,
        totalPositionValue,
        returnPercentage: totalPositionValue > 0 ? (totalUnrealizedPnl / totalPositionValue) * 100 : 0,
        positions: positions.map(pos => ({
          exchange: pos.exchange,
          symbol: pos.symbol,
          side: pos.side,
          unrealizedPnl: pos.unrealized_pnl || 0,
          liquidationDistance: this.calculateLiquidationDistance(pos),
        })),
      };

    } catch (error) {
      this.logger.error('Failed to get position metrics:', error);
      return null;
    }
  }
} 