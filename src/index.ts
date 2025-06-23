import * as dotenv from 'dotenv';
import { logger, logError } from './utils/logger';
import { SupabaseClientManager } from './database/supabase.client';
import { BybitExchange } from './exchanges/bybit/BybitExchange';
import { DataCollector } from './services/DataCollector';
import { ArbitrageAnalyzer } from './services/ArbitrageAnalyzer';
import { IExchange } from './exchanges/interfaces/IExchange';
import { ArbitrageOpportunity } from './types/common';
import { arbitrageConfig, tradingParams } from './config/arbitrage.config';
import { sleep } from './utils/helpers';

// Load environment variables
dotenv.config();

class FundingArbitrageEngine {
  private exchanges: IExchange[] = [];
  private dataCollector: DataCollector;
  private arbitrageAnalyzer: ArbitrageAnalyzer;
  private dbClient: SupabaseClientManager;
  private isRunning = false;
  private mainLoop: NodeJS.Timeout | null = null;

  constructor() {
    this.dbClient = SupabaseClientManager.getInstance();
    this.dataCollector = new DataCollector();
    this.arbitrageAnalyzer = new ArbitrageAnalyzer(this.dataCollector);
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

      // Disconnect exchanges
      await Promise.all(
        this.exchanges.map(exchange => exchange.disconnect())
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

      // Initialize exchanges
      await this.initializeExchanges();

      // Start data collection
      await this.dataCollector.start(this.exchanges);

      // Collect initial historical data
      await this.collectInitialData();

      logger.info('All components initialized successfully');
    } catch (error) {
      logError(error as Error, { context: 'initialize' });
      throw error;
    }
  }

  private async initializeExchanges(): Promise<void> {
    try {
      logger.info('Initializing exchanges...');

      // Initialize Bybit
      if (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
        const bybit = new BybitExchange();
        await bybit.initialize();
        this.exchanges.push(bybit);
        logger.info('Bybit exchange initialized');
      } else {
        logger.warn('Bybit API credentials not found, skipping');
      }

      // TODO: Initialize other exchanges (Bitget, KuCoin, Hyperliquid)
      // Similar pattern as Bybit

      if (this.exchanges.length === 0) {
        throw new Error('No exchanges were initialized');
      }

      logger.info(`Initialized ${this.exchanges.length} exchanges`);
    } catch (error) {
      logError(error as Error, { context: 'initializeExchanges' });
      throw error;
    }
  }

  private async collectInitialData(): Promise<void> {
    try {
      logger.info('Collecting initial historical data...');

      // Collect last 72 hours of funding rate data
      await this.dataCollector.collectHistoricalFundingRates(
        this.exchanges,
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

      // Find arbitrage opportunities
      const opportunities = await this.arbitrageAnalyzer.findOpportunities(this.exchanges);

      if (opportunities.length === 0) {
        logger.info('No arbitrage opportunities found');
        return;
      }

      // Process the best opportunity
      const bestOpportunity = opportunities[0];
      logger.info(`Processing best opportunity: ${bestOpportunity.baseSymbol} ` +
        `(${bestOpportunity.longExchange} -> ${bestOpportunity.shortExchange}, ` +
        `${bestOpportunity.estimatedProfitBps} bps)`);

      // Validate opportunity is still good
      const isValid = await this.arbitrageAnalyzer.validateOpportunity(bestOpportunity);
      if (!isValid) {
        logger.warn('Best opportunity validation failed');
        return;
      }

      // Execute arbitrage (placeholder - would need OrderExecutor)
      await this.executeArbitrage(bestOpportunity);

    } catch (error) {
      logError(error as Error, { context: 'runArbitrageLoop' });
    }
  }

  private async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      logger.info(`Executing arbitrage for ${opportunity.baseSymbol}`);

      // This is a placeholder implementation
      // In a real system, this would use the OrderExecutor service
      
      logger.warn('Arbitrage execution not implemented yet - this is a placeholder');
      
      // TODO: Implement actual order execution
      // 1. Get the exchanges
      // 2. Set leverage on both exchanges
      // 3. Calculate optimal position size
      // 4. Execute IOC orders on both exchanges
      // 5. Verify both legs filled
      // 6. Store positions in database
      // 7. Start position monitoring

    } catch (error) {
      logError(error as Error, { 
        context: 'executeArbitrage',
        opportunity: {
          baseSymbol: opportunity.baseSymbol,
          longExchange: opportunity.longExchange,
          shortExchange: opportunity.shortExchange,
        }
      });
    }
  }

  public async getStatus(): Promise<{
    isRunning: boolean;
    exchangeCount: number;
    exchanges: string[];
    dataCollector: any;
    uptime: number;
  }> {
    const startTime = Date.now(); // This should be tracked properly
    
    return {
      isRunning: this.isRunning,
      exchangeCount: this.exchanges.length,
      exchanges: this.exchanges.map(ex => ex.getName()),
      dataCollector: this.dataCollector.getStatus(),
      uptime: 0, // Would need to track start time
    };
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await engine.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await engine.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Create and start the engine
const engine = new FundingArbitrageEngine();

if (require.main === module) {
  // Start the engine if this file is run directly
  engine.start().catch(error => {
    logger.error('Failed to start engine:', error);
    process.exit(1);
  });
}

export { FundingArbitrageEngine }; 