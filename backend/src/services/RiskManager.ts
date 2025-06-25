import { ArbitrageOpportunity, Position, RiskMetrics } from '../types/common';
import { supabaseClient } from '../database/supabase.client';
import { arbitrageConfig } from '../config/arbitrage.config';
import { Logger } from '../utils/logger';
import { calculatePercentage } from '../utils/helpers';

export class RiskManager {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('RiskManager');
  }

  public async validateTrade(opportunity: ArbitrageOpportunity): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    this.logger.debug(`Validating trade for ${opportunity.symbol}`);

    try {
      // 1. Check total exposure across all positions
      const totalExposure = await this.calculateTotalExposure();
      const newExposure = totalExposure + opportunity.optimalSize;
      
      if (newExposure > arbitrageConfig.riskManagement.totalCapital * 0.8) { // 80% max exposure
        return {
          isValid: false,
          reason: `Total exposure would exceed limit: $${newExposure} > $${arbitrageConfig.riskManagement.totalCapital * 0.8}`
        };
      }

      // 2. Check concentration risk per symbol
      const symbolExposure = await this.getSymbolExposure(opportunity.symbol);
      const newSymbolExposure = symbolExposure + opportunity.optimalSize;
      const maxSymbolExposure = arbitrageConfig.riskManagement.totalCapital * 0.3; // 30% max per symbol
      
      if (newSymbolExposure > maxSymbolExposure) {
        return {
          isValid: false,
          reason: `Symbol concentration risk: $${newSymbolExposure} > $${maxSymbolExposure} for ${opportunity.symbol}`
        };
      }

      // 3. Check concurrent positions limit
      const activeStrategies = await this.getActiveStrategyCount();
      if (activeStrategies >= arbitrageConfig.riskManagement.maxConcurrentPositions) {
        return {
          isValid: false,
          reason: `Max concurrent strategies limit reached: ${activeStrategies}`
        };
      }

      // 4. Check position size limits
      if (opportunity.optimalSize > arbitrageConfig.maxPositionSize) {
        return {
          isValid: false,
          reason: `Position size exceeds limit: $${opportunity.optimalSize} > $${arbitrageConfig.maxPositionSize}`
        };
      }

      // 5. Check minimum position size
      if (opportunity.optimalSize < 100) {
        return {
          isValid: false,
          reason: `Position size below minimum: $${opportunity.optimalSize} < $100`
        };
      }

      // 6. Check risk score
      if (opportunity.riskScore > 0.7) { // 70% max risk score
        return {
          isValid: false,
          reason: `Risk score too high: ${(opportunity.riskScore * 100).toFixed(1)}% > 70%`
        };
      }

      // 7. Check confidence level
      if (opportunity.confidence < 0.4) { // 40% min confidence
        return {
          isValid: false,
          reason: `Confidence too low: ${(opportunity.confidence * 100).toFixed(1)}% < 40%`
        };
      }

      // 8. Check kill switch conditions
      const killSwitchActive = await this.checkKillSwitchStatus();
      if (killSwitchActive) {
        return {
          isValid: false,
          reason: 'Kill switch is active - no new positions allowed'
        };
      }

      return { isValid: true };

    } catch (error) {
      this.logger.error('Failed to validate trade:', error);
      return {
        isValid: false,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async calculateTotalExposure(): Promise<number> {
    try {
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('quantity, entry_price')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return 0;
      }

      return positions.reduce((total, position) => 
        total + (position.quantity * position.entry_price), 0);

    } catch (error) {
      this.logger.error('Failed to calculate total exposure:', error);
      return 0;
    }
  }

  private async getSymbolExposure(symbol: string): Promise<number> {
    try {
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('quantity, entry_price')
        .eq('symbol', symbol)
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch symbol positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return 0;
      }

      return positions.reduce((total, position) => 
        total + (position.quantity * position.entry_price), 0);

    } catch (error) {
      this.logger.error(`Failed to get symbol exposure for ${symbol}:`, error);
      return 0;
    }
  }

  private async getActiveStrategyCount(): Promise<number> {
    try {
      const { data, error } = await supabaseClient
        .from('positions')
        .select('strategy_id')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch active strategies: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return 0;
      }

      const uniqueStrategies = new Set(data.map(p => p.strategy_id));
      return uniqueStrategies.size;

    } catch (error) {
      this.logger.error('Failed to get active strategy count:', error);
      return 0;
    }
  }

  private async checkKillSwitchStatus(): Promise<boolean> {
    try {
      // Check for recent kill switch events
      const { data, error } = await supabaseClient
        .from('system_logs')
        .select('timestamp')
        .eq('source', 'PositionMonitor')
        .ilike('message', '%kill switch%')
        .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
        .limit(1);

      if (error) {
        throw new Error(`Failed to check kill switch status: ${error.message}`);
      }

      return data && data.length > 0;

    } catch (error) {
      this.logger.error('Failed to check kill switch status:', error);
      return false; // Allow trading if we can't determine status
    }
  }

  public async checkNearLiquidation(position: Position): Promise<boolean> {
    try {
      const currentPrice = position.entryPrice; // Should be current market price
      const liquidationPrice = position.liquidationPrice;

      if (!liquidationPrice) return false;

      let distanceToLiquidation: number;

      if (position.side === 'long') {
        distanceToLiquidation = ((currentPrice - liquidationPrice) / currentPrice) * 100;
      } else {
        distanceToLiquidation = ((liquidationPrice - currentPrice) / currentPrice) * 100;
      }

      const threshold = arbitrageConfig.killSwitchThresholds.nearLiquidationPercent;
      return distanceToLiquidation < threshold;

    } catch (error) {
      this.logger.error('Failed to check liquidation distance:', error);
      return false;
    }
  }

  public async enforcePositionLimits(): Promise<void> {
    this.logger.info('Enforcing position limits');

    try {
      // Check total exposure
      const totalExposure = await this.calculateTotalExposure();
      const maxExposure = arbitrageConfig.riskManagement.totalCapital * 0.9; // 90% emergency limit

      if (totalExposure > maxExposure) {
        this.logger.warn(`Total exposure ${totalExposure} exceeds emergency limit ${maxExposure}`);
        await this.closeExcessPositions();
      }

      // Check individual position sizes
      await this.checkOversizedPositions();

      // Update risk metrics
      await this.updateRiskMetrics();

    } catch (error) {
      this.logger.error('Failed to enforce position limits:', error);
    }
  }

  private async closeExcessPositions(): Promise<void> {
    this.logger.warn('Closing excess positions due to risk limits');

    try {
      // Get all positions sorted by unrealized PnL (close worst performing first)
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('status', 'open')
        .order('unrealized_pnl', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch positions for closure: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return;
      }

      // Close positions until we're within limits
      let currentExposure = await this.calculateTotalExposure();
      const targetExposure = arbitrageConfig.riskManagement.totalCapital * 0.7; // 70% target

      for (const position of positions) {
        if (currentExposure <= targetExposure) {
          break;
        }

        try {
          // Close this position (would need to implement via OrderExecutor)
          await this.closePosition(position.strategy_id, `Risk limit enforcement`);
          
          const positionValue = position.quantity * position.entry_price;
          currentExposure -= positionValue;

          this.logger.info(`Closed position ${position.exchange}:${position.symbol} for risk management`);

        } catch (error) {
          this.logger.error(`Failed to close position ${position.id}:`, error);
        }
      }

    } catch (error) {
      this.logger.error('Failed to close excess positions:', error);
    }
  }

  private async checkOversizedPositions(): Promise<void> {
    try {
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return;
      }

      for (const position of positions) {
        const positionValue = position.quantity * position.entry_price;
        
        if (positionValue > arbitrageConfig.maxPositionSize * 1.1) { // 10% tolerance
          this.logger.warn(`Oversized position detected: ${position.exchange}:${position.symbol} = $${positionValue}`);
          
          // Could implement position reduction logic here
        }
      }

    } catch (error) {
      this.logger.error('Failed to check oversized positions:', error);
    }
  }

  private async closePosition(strategyId: string, reason: string): Promise<void> {
    // This would integrate with OrderExecutor to close positions
    // For now, just update database status
    try {
      await supabaseClient
        .from('positions')
        .update({ 
          status: 'closed',
          updated_at: new Date().toISOString()
        })
        .eq('strategy_id', strategyId)
        .eq('status', 'open');

      // Log the closure
      await supabaseClient
        .from('system_logs')
        .insert({
          level: 'info',
          message: `Position closed by risk manager: ${reason}`,
          metadata: { strategyId, reason },
          source: 'RiskManager',
        });

    } catch (error) {
      this.logger.error(`Failed to close position ${strategyId}:`, error);
    }
  }

  public async getRiskMetrics(): Promise<RiskMetrics> {
    try {
      const { data: positions, error } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return {
          totalExposure: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          winRate: 0,
          avgProfit: 0,
          avgLoss: 0,
        };
      }

      const totalExposure = positions.reduce((sum, pos) => 
        sum + (pos.quantity * pos.entry_price), 0);

      const totalPnL = positions.reduce((sum, pos) => 
        sum + (pos.unrealized_pnl || 0), 0);

      // Calculate other metrics (simplified for MVP)
      const maxDrawdown = this.calculateMaxDrawdown(positions);

      return {
        totalExposure,
        maxDrawdown,
        sharpeRatio: 0, // Would need historical data
        winRate: 0, // Would need closed position data
        avgProfit: totalPnL / positions.length,
        avgLoss: 0, // Would need closed position data
      };

    } catch (error) {
      this.logger.error('Failed to get risk metrics:', error);
      return {
        totalExposure: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
      };
    }
  }

  private calculateMaxDrawdown(positions: any[]): number {
    let maxDrawdown = 0;

    for (const position of positions) {
      const unrealizedPnl = position.unrealized_pnl || 0;
      const positionValue = position.quantity * position.entry_price;
      
      if (unrealizedPnl < 0 && positionValue > 0) {
        const drawdown = Math.abs(unrealizedPnl / positionValue) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  private async updateRiskMetrics(): Promise<void> {
    try {
      const metrics = await this.getRiskMetrics();
      
      await supabaseClient
        .from('risk_metrics')
        .insert({
          total_exposure: metrics.totalExposure,
          total_pnl: metrics.avgProfit,
          max_drawdown: metrics.maxDrawdown,
          active_positions: await this.getActiveStrategyCount(),
          timestamp: new Date().toISOString(),
        });

    } catch (error) {
      this.logger.error('Failed to update risk metrics:', error);
    }
  }
} 