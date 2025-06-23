import * as dotenv from 'dotenv';
import { logger, logError } from './utils/logger';
import { SupabaseClientManager } from './database/supabase.client';
import { BybitExchange } from './exchanges/bybit/BybitExchange';
import { BitgetExchange } from './exchanges/bitget/BitgetExchange';
import { KucoinExchange } from './exchanges/kucoin/KucoinExchange';
import { HyperliquidExchange } from './exchanges/hyperliquid/HyperliquidExchange';
import { DataCollector } from './services/DataCollector';
import { ArbitrageAnalyzer } from './services/ArbitrageAnalyzer';
import { OrderExecutor } from './services/OrderExecutor';
import { PositionMonitor } from './services/PositionMonitor';
import { RiskManager } from './services/RiskManager';
import { TelegramService } from './services/TelegramService';
import { IExchange } from './exchanges/interfaces/IExchange';
import { ArbitrageOpportunity } from './types/common';
import { arbitrageConfig, tradingParams } from './config/arbitrage.config';
import { telegramConfig } from './config/telegram.config';
import { getSymbolMapper } from './utils/symbolMapper';
import { SymbolMappingService } from './services/SymbolMappingService';
import { sleep } from './utils/helpers';

// Load environment variables
dotenv.config();

class FundingArbitrageEngine {
  private dataCollector: DataCollector;
  private arbitrageAnalyzer!: ArbitrageAnalyzer;
  private orderExecutor!: OrderExecutor;
  private positionMonitor!: PositionMonitor;
  private riskManager!: RiskManager;
  private telegramService!: TelegramService;
  private dbClient: SupabaseClientManager;
  private symbolMapper = getSymbolMapper();
  private symbolMappingService: SymbolMappingService;
  private isRunning = false;
  private mainLoop: NodeJS.Timeout | null = null;
  private startTime: Date;
  private activeExchanges: IExchange[] = [];

  constructor() {
    this.dbClient = SupabaseClientManager.getInstance();
    this.dataCollector = new DataCollector();
    this.symbolMappingService = new SymbolMappingService();
    this.startTime = new Date();
  }

  public async start(): Promise<void> {
    try {
      logger.info('Starting Funding Rate Arbitrage Engine');

      // Initialize components
      await this.initialize();

      // Start main loop
      this.isRunning = true;
      await this.startMainLoop();

      logger.info('Funding Rate Arbitrage Engine started successfully');
    } catch (error) {
      logError(error as Error, { context: 'start' });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Stopping Funding Rate Arbitrage Engine');

      this.isRunning = false;

      // Stop main loop
      if (this.mainLoop) {
        clearInterval(this.mainLoop);
        this.mainLoop = null;
      }

      // Stop services
      this.dataCollector.stop();
      this.positionMonitor.stop();

      // Disconnect exchanges
      await Promise.all(
        this.activeExchanges.map(exchange => exchange.disconnect())
      );

      logger.info('Funding Rate Arbitrage Engine stopped successfully');
    } catch (error) {
      logError(error as Error, { context: 'stop' });
    }
  }

  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing components...');

      // Test database connection
      const dbConnected = await this.dbClient.testConnection();
      if (!dbConnected) {
        throw new Error('Failed to connect to database');
      }

      // Initialize symbol mapper and comprehensive symbol mapping service
      await this.symbolMapper.initialize();
      
      // Load or build comprehensive symbol mappings
      logger.info('Loading comprehensive symbol mappings...');
      await this.symbolMappingService.loadMappingsFromDatabase();
      
      // Log mapping statistics
      const stats = this.symbolMappingService.getMappingStats();
      logger.info(`Symbol mapping stats: ${stats.totalSymbols} total symbols, ${JSON.stringify(stats.byExchange)} by exchange`);

      // Initialize exchanges
      await this.initializeExchanges();

      // Initialize services
      this.arbitrageAnalyzer = ArbitrageAnalyzer.getInstance(this.dataCollector, this.symbolMappingService);
      this.orderExecutor = new OrderExecutor(this.activeExchanges);
      this.riskManager = new RiskManager(this.activeExchanges);
      this.positionMonitor = new PositionMonitor(this.activeExchanges, this.orderExecutor);
      this.telegramService = TelegramService.getInstance();

      // Start data collection
      await this.dataCollector.start(this.activeExchanges);

      // Start position monitoring
      this.positionMonitor.start();

      // Collect initial historical data
      await this.collectInitialData();

      logger.info('All components initialized successfully');
    } catch (error) {
      logError(error as Error, { context: 'initialize' });
      throw error;
    }
  }

  /**
   * Initialize exchange connections
   */
  private async initializeExchanges(): Promise<void> {
    logger.info('Initializing exchanges...');
    this.activeExchanges = [];

    // Initialize Bybit
    if (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
      try {
        logger.info('Initializing bybit exchange');
        const bybit = new BybitExchange();
        await bybit.initialize();
        this.activeExchanges.push(bybit);
        logger.info('Bybit exchange initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Bybit:', (error as Error).message);
      }
    }

    // Initialize Bitget
    if (process.env.BITGET_API_KEY && process.env.BITGET_API_SECRET && process.env.BITGET_PASSPHRASE) {
      try {
        logger.info('Initializing bitget exchange');
        const bitget = new BitgetExchange();
        await bitget.initialize();
        this.activeExchanges.push(bitget);
        logger.info('Bitget exchange initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Bitget:', (error as Error).message);
      }
    }

    // Only try to initialize KuCoin if explicitly enabled
    if (process.env.ENABLE_KUCOIN === 'true' && process.env.KUCOIN_API_KEY && process.env.KUCOIN_API_SECRET && process.env.KUCOIN_PASSPHRASE) {
      try {
        logger.info('Initializing kucoin exchange');
        const kucoin = new KucoinExchange();
        await kucoin.initialize();
        this.activeExchanges.push(kucoin);
        logger.info('KuCoin exchange initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize KuCoin:', (error as Error).message);
      }
    }

    // Only try to initialize Hyperliquid if explicitly enabled
    if (process.env.ENABLE_HYPERLIQUID === 'true' && process.env.HYPERLIQUID_PRIVATE_KEY) {
      try {
        logger.info('Initializing hyperliquid exchange');
        const hyperliquid = new HyperliquidExchange();
        await hyperliquid.initialize();
        this.activeExchanges.push(hyperliquid);
        logger.info('Hyperliquid exchange initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Hyperliquid:', (error as Error).message);
      }
    }

    if (this.activeExchanges.length === 0) {
      throw new Error('No exchanges were initialized');
    }

    logger.info(`Initialized ${this.activeExchanges.length} exchanges successfully`);
  }

  private async collectInitialData(): Promise<void> {
    try {
      logger.info('Collecting initial historical data...');

      // Collect last 72 hours of funding rate data
      await this.dataCollector.collectHistoricalFundingRates(
        this.activeExchanges,
        arbitrageConfig.symbols,
        arbitrageConfig.analysisWindowHours
      );

      logger.info('Initial data collection completed');
    } catch (error) {
      logError(error as Error, { context: 'collectInitialData' });
      // Don't throw - we can continue without historical data
    }
  }

  private async startMainLoop(): Promise<void> {
    logger.info('Starting main arbitrage loop');

    // Run immediately once
    await this.runArbitrageLoop();

    // Schedule regular runs
    this.mainLoop = setInterval(() => {
      if (this.isRunning) {
        this.runArbitrageLoop().catch(error => {
          logError(error as Error, { context: 'mainLoop' });
        });
      }
    }, arbitrageConfig.checkIntervalMs);
  }

  private async runArbitrageLoop(): Promise<void> {
    try {
      logger.info('Running arbitrage analysis cycle');

      // Check risk conditions first
      const riskSummary = await this.riskManager.getRiskSummary();
      
      if (riskSummary.riskLevel === 'CRITICAL') {
        logger.warn('CRITICAL risk level detected, skipping new trades');
        logger.warn(`Risk warnings: ${riskSummary.warnings.join(', ')}`);
        return;
      }

      if (riskSummary.riskLevel === 'HIGH') {
        logger.warn(`HIGH risk level: ${riskSummary.warnings.join(', ')}`);
      }

      // Find arbitrage opportunities
      const opportunities = await this.arbitrageAnalyzer.findOpportunities(this.activeExchanges);

      if (opportunities.length === 0) {
        logger.info('No arbitrage opportunities found');
        return;
      }

      logger.info(`Found ${opportunities.length} potential opportunities`);

      // Process opportunities
      for (const opportunity of opportunities.slice(0, 3)) { // Limit to top 3
        try {
          // Validate opportunity with risk manager
          const isValidRisk = await this.riskManager.validateTrade(opportunity);
          if (!isValidRisk) {
            logger.info(`Opportunity ${opportunity.baseSymbol} rejected by risk manager`);
            continue;
          }

          // Re-validate opportunity is still good
          const isValidOpportunity = await this.arbitrageAnalyzer.validateOpportunity(opportunity);
          if (!isValidOpportunity) {
            logger.info(`Opportunity ${opportunity.baseSymbol} validation failed`);
            continue;
          }

          logger.info(`Executing opportunity: ${opportunity.baseSymbol} ` +
            `(${opportunity.longExchange} -> ${opportunity.shortExchange}, ` +
            `${opportunity.estimatedProfitBps} bps)`);

          // Execute arbitrage
          const strategyId = await this.orderExecutor.executeArbitrage(opportunity);
          
          logger.info(`Successfully executed arbitrage strategy ${strategyId}`);
          break; // Execute only one opportunity per cycle

        } catch (error) {
          logError(error as Error, { 
            context: 'runArbitrageLoop_execute',
            opportunity: opportunity.baseSymbol 
          });
          // Continue to next opportunity
        }
      }

    } catch (error) {
      logError(error as Error, { context: 'runArbitrageLoop' });
    }
  }

  public async getStatus(): Promise<{
    isRunning: boolean;
    uptime: number;
    exchangeCount: number;
    exchanges: string[];
    dataCollector: any;
    positionMonitor: any;
    riskSummary: any;
    activeStrategies: number;
    telegramStatus: {
      enabled: boolean;
      isRunning: boolean;
    };
  }> {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000; // in seconds
    const riskSummary = await this.riskManager.getRiskSummary();
    const monitoringStatus = await this.positionMonitor.getMonitoringStatus();

    return {
      isRunning: this.isRunning,
      uptime,
      exchangeCount: this.activeExchanges.length,
      exchanges: this.activeExchanges.map(e => e.getName()),
      dataCollector: await this.dataCollector.getStatus(),
      positionMonitor: monitoringStatus,
      riskSummary,
      activeStrategies: monitoringStatus.activePositions,
      telegramStatus: {
        enabled: telegramConfig.enabled,
        isRunning: telegramConfig.enabled
      },
    };
  }

  public async emergencyShutdown(): Promise<void> {
    try {
      logger.warn('EMERGENCY SHUTDOWN INITIATED');

      // Stop all new trades
      this.isRunning = false;

      // Close all active positions
      const { data: strategies } = await this.dbClient.getClient()
        .from('strategy_performance')
        .select('strategy_id')
        .eq('status', 'active');

      if (strategies) {
        for (const strategy of strategies) {
          await this.orderExecutor.closeStrategy(strategy.strategy_id, 'emergency_shutdown');
        }
      }

      // Stop all services
      await this.stop();

      logger.warn('EMERGENCY SHUTDOWN COMPLETED');
    } catch (error) {
      logError(error as Error, { context: 'emergencyShutdown' });
    }
  }

  public async forceCloseAllPositions(): Promise<void> {
    try {
      logger.warn('Force closing all positions');

      const { data: strategies } = await this.dbClient.getClient()
        .from('strategy_performance')
        .select('strategy_id')
        .eq('status', 'active');

      if (strategies) {
        const closeTasks = strategies.map(strategy => 
          this.orderExecutor.closeStrategy(strategy.strategy_id, 'force_close')
        );

        await Promise.allSettled(closeTasks);
      }

      logger.info('All positions closed');
    } catch (error) {
      logError(error as Error, { context: 'forceCloseAllPositions' });
    }
  }
}

// Create and export engine instance
export const engine = new FundingArbitrageEngine();

// Handle process termination gracefully
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await engine.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await engine.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception:', error);
  await engine.emergencyShutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  await engine.emergencyShutdown();
  process.exit(1);
});

// Start the engine if this file is run directly
if (require.main === module) {
  engine.start().catch(async (error) => {
    logger.error('Failed to start engine:', error);
    await engine.emergencyShutdown();
    process.exit(1);
  });
} 