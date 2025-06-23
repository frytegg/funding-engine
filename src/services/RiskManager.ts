import { IExchange } from '../exchanges/interfaces/IExchange';
import { SupabaseClientManager } from '../database/supabase.client';
import { 
  ArbitrageOpportunity, 
  Position, 
  RiskMetrics
} from '../types/common';
import { logger, logError } from '../utils/logger';
import { arbitrageConfig, riskLimits } from '../config/arbitrage.config';

export class RiskManager {
  private dbClient: SupabaseClientManager;
  private exchanges: Map<string, IExchange> = new Map();

  constructor(exchanges: IExchange[]) {
    this.dbClient = SupabaseClientManager.getInstance();
    exchanges.forEach(exchange => {
      this.exchanges.set(exchange.getName(), exchange);
    });
  }

  public async validateTrade(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      logger.debug(`Validating trade for ${opportunity.baseSymbol}`);

      // Check 1: Total exposure limits
      if (!(await this.checkTotalExposure(opportunity))) {
        logger.warn('Trade rejected: Total exposure limit exceeded');
        return false;
      }

      // Check 2: Concentration risk per symbol
      if (!(await this.checkConcentrationRisk(opportunity))) {
        logger.warn('Trade rejected: Symbol concentration limit exceeded');
        return false;
      }

      // Check 3: Available margin
      if (!(await this.checkAvailableMargin(opportunity))) {
        logger.warn('Trade rejected: Insufficient available margin');
        return false;
      }

      // Check 4: Position limits
      if (!(await this.checkPositionLimits())) {
        logger.warn('Trade rejected: Position limits exceeded');
        return false;
      }

      // Check 5: Kill switch conditions
      if (await this.checkKillSwitchConditions()) {
        logger.warn('Trade rejected: Kill switch conditions active');
        return false;
      }

      // Check 6: Minimum profit threshold
      if (!this.checkMinimumProfit(opportunity)) {
        logger.warn('Trade rejected: Below minimum profit threshold');
        return false;
      }

      logger.debug(`Trade validation passed for ${opportunity.baseSymbol}`);
      return true;

    } catch (error) {
      logError(error as Error, { 
        context: 'validateTrade', 
        opportunity: opportunity.baseSymbol 
      });
      return false;
    }
  }

  private async checkTotalExposure(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      // Get current total exposure
      const currentExposure = await this.calculateTotalExposure();
      const newExposure = opportunity.requiredCapital;
      const totalExposure = currentExposure + newExposure;

      // Check against total capital limit
      const maxExposure = arbitrageConfig.totalCapital * 0.9; // 90% of total capital
      
      return totalExposure <= maxExposure;
    } catch (error) {
      logError(error as Error, { context: 'checkTotalExposure' });
      return false;
    }
  }

  private async checkConcentrationRisk(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      // Get current exposure for this symbol
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('quantity, entry_price')
        .eq('symbol', opportunity.baseSymbol)
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch symbol positions: ${error.message}`);
      }

      // Calculate current exposure for this symbol
      let currentSymbolExposure = 0;
      if (positions) {
        currentSymbolExposure = positions.reduce((total, pos) => {
          return total + (pos.quantity * pos.entry_price);
        }, 0);
      }

      // Add new exposure
      const newExposure = opportunity.requiredCapital;
      const totalSymbolExposure = currentSymbolExposure + newExposure;

      // Check against concentration limit
      const maxSymbolExposure = arbitrageConfig.totalCapital * riskLimits.maxConcentrationPerSymbol;
      
      return totalSymbolExposure <= maxSymbolExposure;
    } catch (error) {
      logError(error as Error, { context: 'checkConcentrationRisk' });
      return false;
    }
  }

  private async checkAvailableMargin(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      const longExchange = this.exchanges.get(opportunity.longExchange);
      const shortExchange = this.exchanges.get(opportunity.shortExchange);

      if (!longExchange || !shortExchange) {
        return false;
      }

      // Get balance info from both exchanges
      const [longBalance, shortBalance] = await Promise.all([
        longExchange.getBalance(),
        shortExchange.getBalance(),
      ]);

      // Calculate required margin for both legs
      const requiredMarginPerLeg = opportunity.requiredCapital / 2; // Split between exchanges
      const marginBuffer = 1.2; // 20% buffer

      // Check if both exchanges have sufficient available balance
      const longAvailable = longBalance.availableBalance;
      const shortAvailable = shortBalance.availableBalance;

      return (longAvailable >= requiredMarginPerLeg * marginBuffer) &&
             (shortAvailable >= requiredMarginPerLeg * marginBuffer);

    } catch (error) {
      logError(error as Error, { context: 'checkAvailableMargin' });
      return false;
    }
  }

  private async checkPositionLimits(): Promise<boolean> {
    try {
      // Count active positions per exchange
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('exchange')
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions) return true;

      // Count positions by exchange
      const exchangeCounts = positions.reduce((counts: { [key: string]: number }, pos) => {
        counts[pos.exchange] = (counts[pos.exchange] || 0) + 1;
        return counts;
      }, {});

      // Check per-exchange limits
      for (const [exchange, count] of Object.entries(exchangeCounts)) {
        if (count >= riskLimits.maxPositionsPerExchange) {
          logger.warn(`Exchange ${exchange} has ${count} positions, limit: ${riskLimits.maxPositionsPerExchange}`);
          return false;
        }
      }

      // Check total position limit
      const totalPositions = positions.length;
      if (totalPositions >= riskLimits.maxTotalPositions) {
        logger.warn(`Total positions ${totalPositions}, limit: ${riskLimits.maxTotalPositions}`);
        return false;
      }

      return true;
    } catch (error) {
      logError(error as Error, { context: 'checkPositionLimits' });
      return false;
    }
  }

  private async checkKillSwitchConditions(): Promise<boolean> {
    try {
      // Check if any kill switch conditions are currently active
      const riskMetrics = await this.calculateRiskMetrics();

      // Check near liquidation threshold
      if (riskMetrics.nearLiquidationCount > 0) {
        logger.warn(`${riskMetrics.nearLiquidationCount} positions near liquidation`);
        return true; // Kill switch active
      }

      // Check max drawdown
      if (riskMetrics.maxDrawdown > arbitrageConfig.killSwitchThresholds.maxDrawdownPercent) {
        logger.warn(`Max drawdown ${riskMetrics.maxDrawdown}% exceeds limit`);
        return true; // Kill switch active
      }

      // Check margin utilization
      if (riskMetrics.marginUtilization > 80) { // 80%
        logger.warn(`High margin utilization: ${riskMetrics.marginUtilization}%`);
        return true; // Kill switch active
      }

      return false; // No kill switch conditions
    } catch (error) {
      logError(error as Error, { context: 'checkKillSwitchConditions' });
      return true; // Err on safe side
    }
  }

  private checkMinimumProfit(opportunity: ArbitrageOpportunity): boolean {
    // Calculate estimated profit in USD
    const estimatedProfitUsd = (opportunity.estimatedProfitBps / 10000) * opportunity.requiredCapital;
    
    return estimatedProfitUsd >= riskLimits.minProfitThresholdUsd;
  }

  public async checkNearLiquidation(position: Position): Promise<boolean> {
    try {
      if (!position.liquidationPrice || position.liquidationPrice === 0) {
        return false;
      }

      const currentPrice = position.markPrice;
      const liquidationPrice = position.liquidationPrice;
      
      let distanceToLiquidation: number;
      
      if (position.side === 'long') {
        distanceToLiquidation = (currentPrice - liquidationPrice) / currentPrice;
      } else {
        distanceToLiquidation = (liquidationPrice - currentPrice) / currentPrice;
      }

      const thresholdPercent = arbitrageConfig.killSwitchThresholds.nearLiquidationPercent / 100;
      
      return distanceToLiquidation < thresholdPercent;
    } catch (error) {
      logError(error as Error, { context: 'checkNearLiquidation' });
      return false;
    }
  }

  public async enforcePositionLimits(): Promise<void> {
    try {
      logger.info('Enforcing position limits');

      // Get all active positions
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('*')
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      if (!positions || positions.length === 0) {
        return;
      }

      // Check for positions that need to be closed
      const positionsToClose = [];

      // Group by strategy to identify which strategies to close
      const strategiesBySize = new Map<string, { positions: any[], totalSize: number }>();
      
      positions.forEach(pos => {
        const strategyId = pos.strategy_id;
        if (!strategiesBySize.has(strategyId)) {
          strategiesBySize.set(strategyId, { positions: [], totalSize: 0 });
        }
        const strategy = strategiesBySize.get(strategyId)!;
        strategy.positions.push(pos);
        strategy.totalSize += pos.quantity * pos.entry_price;
      });

      // Sort strategies by size (largest first) for closure priority
      const sortedStrategies = Array.from(strategiesBySize.entries())
        .sort((a, b) => b[1].totalSize - a[1].totalSize);

      // Close largest strategies if limits exceeded
      let currentPositionCount = positions.length;
      for (const [strategyId, strategyData] of sortedStrategies) {
        if (currentPositionCount <= riskLimits.maxTotalPositions) {
          break;
        }

        logger.warn(`Closing strategy ${strategyId} to enforce position limits`);
        positionsToClose.push(strategyId);
        currentPositionCount -= strategyData.positions.length;
      }

      // Close strategies
      // This would typically use OrderExecutor, but keeping it simple here
      for (const strategyId of positionsToClose) {
        await this.dbClient.getClient()
          .from('strategy_performance')
          .update({ 
            status: 'closed_risk_limit', 
            exit_time: new Date() 
          })
          .eq('strategy_id', strategyId);
      }

      if (positionsToClose.length > 0) {
        logger.info(`Closed ${positionsToClose.length} strategies to enforce limits`);
      }

    } catch (error) {
      logError(error as Error, { context: 'enforcePositionLimits' });
    }
  }

  public async calculateRiskMetrics(): Promise<RiskMetrics> {
    try {
      // Get all active positions
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('*')
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }

      let totalExposure = 0;
      let totalUnrealizedPnl = 0;
      let nearLiquidationCount = 0;
      let marginUsed = 0;

      if (positions && positions.length > 0) {
        // Calculate metrics from positions
        for (const pos of positions) {
          const positionValue = pos.quantity * pos.entry_price;
          totalExposure += positionValue;
          marginUsed += positionValue / pos.leverage;

          // Get current position from exchange for PnL calculation
          const exchange = this.exchanges.get(pos.exchange);
          if (exchange) {
            try {
              const currentPos = await exchange.getPosition(pos.symbol);
              if (currentPos) {
                totalUnrealizedPnl += currentPos.unrealizedPnl;
                
                // Check if near liquidation
                if (await this.checkNearLiquidation(currentPos)) {
                  nearLiquidationCount++;
                }
              }
            } catch (error) {
              // Skip if can't get current position
            }
          }
        }
      }

      // Calculate margin utilization
      const totalCapital = arbitrageConfig.totalCapital;
      const marginUtilization = (marginUsed / totalCapital) * 100;

      // Calculate max drawdown (simplified)
      const maxDrawdown = totalUnrealizedPnl < 0 ? 
        Math.abs(totalUnrealizedPnl / totalCapital) * 100 : 0;

      // Calculate Sharpe ratio (placeholder - would need historical returns)
      const sharpeRatio = 0; // TODO: Implement proper Sharpe calculation

      const riskMetrics: RiskMetrics = {
        totalExposure,
        marginUtilization,
        unrealizedPnl: totalUnrealizedPnl,
        nearLiquidationCount,
        maxDrawdown,
        sharpeRatio,
      };

      // Store metrics in database
      await this.storeRiskMetrics(riskMetrics);

      return riskMetrics;

    } catch (error) {
      logError(error as Error, { context: 'calculateRiskMetrics' });
      return {
        totalExposure: 0,
        marginUtilization: 0,
        unrealizedPnl: 0,
        nearLiquidationCount: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
      };
    }
  }

  private async calculateTotalExposure(): Promise<number> {
    try {
      const { data: positions, error } = await this.dbClient.getClient()
        .from('positions')
        .select('quantity, entry_price')
        .eq('status', 'active');

      if (error || !positions) {
        return 0;
      }

      return positions.reduce((total, pos) => {
        return total + (pos.quantity * pos.entry_price);
      }, 0);
    } catch (error) {
      logError(error as Error, { context: 'calculateTotalExposure' });
      return 0;
    }
  }

  private async storeRiskMetrics(metrics: RiskMetrics): Promise<void> {
    try {
      const { data, error } = await this.dbClient.getClient()
        .from('risk_metrics')
        .insert({
          total_exposure: metrics.totalExposure,
          margin_utilization: metrics.marginUtilization,
          unrealized_pnl: metrics.unrealizedPnl,
          near_liquidation_count: metrics.nearLiquidationCount,
          max_drawdown: metrics.maxDrawdown,
        });

      if (error) {
        throw new Error(`Failed to store risk metrics: ${error.message}`);
      }
    } catch (error) {
      logError(error as Error, { context: 'storeRiskMetrics' });
    }
  }

  public async getRiskSummary(): Promise<{
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    metrics: RiskMetrics;
    warnings: string[];
  }> {
    const metrics = await this.calculateRiskMetrics();
    const warnings: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    // Assess risk level based on metrics
    if (metrics.nearLiquidationCount > 0) {
      warnings.push(`${metrics.nearLiquidationCount} positions near liquidation`);
      riskLevel = 'CRITICAL';
    }

    if (metrics.maxDrawdown > 8) {
      warnings.push(`High drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
      riskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
    }

    if (metrics.marginUtilization > 70) {
      warnings.push(`High margin utilization: ${metrics.marginUtilization.toFixed(2)}%`);
      riskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : 
                  riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    if (metrics.totalExposure > arbitrageConfig.totalCapital * 0.8) {
      warnings.push('High total exposure');
      riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel;
    }

    return {
      riskLevel,
      metrics,
      warnings,
    };
  }
} 