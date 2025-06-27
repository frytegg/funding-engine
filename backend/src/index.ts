// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { Logger } from './utils/logger';
import { DataCollector } from './services/DataCollector';
import { ArbitrageAnalyzer } from './services/ArbitrageAnalyzer';
import { OrderExecutor } from './services/OrderExecutor';
import { PositionMonitor } from './services/PositionMonitor';
import { RiskManager } from './services/RiskManager';
import { TelegramBotService } from './services/TelegramBot';
import { ApiServer } from './api/server';
import { BybitExchange } from './exchanges/bybit/BybitExchange';
import { BitGetExchange } from './exchanges/bitget/BitGetExchange';
import { KuCoinExchange } from './exchanges/kucoin/KuCoinExchange';
import { HyperliquidExchange } from './exchanges/hyperliquid/HyperliquidExchange';
import { bybitConfig } from './config/exchanges/bybit.config';
import { bitgetConfig } from './config/exchanges/bitget.config';
import { kucoinConfig } from './config/exchanges/kucoin.config';
import { hyperliquidConfig } from './config/exchanges/hyperliquid.config';
import * as cron from 'node-cron';

// Parse command line arguments
const args = process.argv.slice(2);
const isReloadCommand = args.includes('--reload-symbols');

class FundingArbitrageEngine {
  private logger: Logger;
  private dataCollector: DataCollector;
  private arbitrageAnalyzer: ArbitrageAnalyzer;
  private orderExecutor: OrderExecutor;
  private positionMonitor: PositionMonitor;
  private riskManager: RiskManager;
  private telegramBot: TelegramBotService;
  private apiServer: ApiServer;
  private isRunning: boolean = false;
  private symbolMapper: any; // Will be initialized in initializeServices

  constructor() {
    this.logger = new Logger('FundingEngine');
    this.telegramBot = new TelegramBotService();
    this.dataCollector = new DataCollector();
    this.arbitrageAnalyzer = new ArbitrageAnalyzer(this.dataCollector, this.telegramBot);
    this.orderExecutor = new OrderExecutor(this.telegramBot);
    this.positionMonitor = new PositionMonitor();
    this.riskManager = new RiskManager();
    this.apiServer = new ApiServer(3001);
  }

  async start(): Promise<void> {
    try {
      // If reload command, just reload symbols and exit
      if (isReloadCommand) {
        this.logger.info('🔄 Manual reload of symbol mappings requested');
        const { SymbolMapper } = await import('./utils/symbolMapper');
        const symbolMapper = SymbolMapper.getInstance();
        await symbolMapper.loadMappings();
        this.logger.info('✅ Symbol mappings reloaded successfully');
        process.exit(0);
        return;
      }

      this.logger.info('🚀 Starting Funding Rate Arbitrage Engine in PRODUCTION mode');
      
      // Start API server first
      await this.apiServer.start();
      this.logger.info('✅ API Server started on port 3001');
      
      // Set up API server with services
      this.apiServer.setServices(this.arbitrageAnalyzer, this.dataCollector, this.telegramBot);
      
      // Verify environment is set to production
      this.verifyProductionConfig();
      
      // Test Telegram bot connection
      if (this.telegramBot.isActive()) {
        const testResult = await this.telegramBot.testConnection();
        if (testResult) {
          this.logger.info('✅ Telegram bot connected successfully');
        } else {
          this.logger.warn('⚠️ Telegram bot connection test failed');
        }
      } else {
        this.logger.info('ℹ️ Telegram bot is not configured');
      }
      
      // Initialize services
      await this.initializeServices();
      
      // Start position monitoring (runs continuously)
      this.positionMonitor.start();
      this.logger.info('📊 Position monitoring started');
      
      // Schedule daily symbol mapping reload at 00:00 UTC
      cron.schedule('0 0 * * *', async () => {
        try {
          this.logger.info('🔄 Starting daily symbol mapping reload');
          await this.symbolMapper.reloadMappings();
          this.logger.info('✅ Daily symbol mapping reload completed');
        } catch (error) {
          this.logger.error('❌ Error in daily symbol mapping reload:', error);
        }
      });
      
      // Log next scheduled runs
      const logNextRuns = () => {
        const now = new Date();
        const nextCollection = new Date(now.getTime() + (30 - (now.getMinutes() % 30)) * 60000);
        const nextAnalysis = new Date(now.getTime() + (15 - (now.getMinutes() % 15)) * 60000);
        
        this.logger.info(`📅 Next data collection scheduled for: ${nextCollection.toISOString()}`);
        this.logger.info(`📅 Next analysis scheduled for: ${nextAnalysis.toISOString()}`);
      };

      // Log initial schedule
      logNextRuns();

      // Start data collection (every 30 minutes)
      cron.schedule('*/30 * * * *', async () => {
        try {
          logNextRuns(); // Log next scheduled run
          this.logger.info('🔄 Starting data collection cycle');
          const startTime = Date.now();
          await this.dataCollector.collectHistoricalFundingRates(72);
          const duration = (Date.now() - startTime) / 1000;
          this.logger.info(`✅ Data collection cycle completed in ${duration.toFixed(1)} seconds`);
        } catch (error) {
          this.logger.error('❌ Error in data collection cycle:', error);
        }
      });
      
      // Start arbitrage analysis (every 15 minutes)
      cron.schedule('*/15 * * * *', async () => {
        try {
          this.logger.info('🔍 Starting arbitrage analysis cycle');
          const startTime = Date.now();
          const opportunities = await this.arbitrageAnalyzer.analyzeOpportunities();
          const duration = (Date.now() - startTime) / 1000;
          
          if (opportunities.length > 0) {
            this.logger.info(`💰 Found ${opportunities.length} arbitrage opportunities in ${duration.toFixed(1)} seconds`);
            
            // Execute profitable opportunities
            for (const opportunity of opportunities) {
              try {
                const riskAssessment = await this.riskManager.validateTrade(opportunity);
                
                if (riskAssessment.isValid) {
                  this.logger.info(`🎯 Executing arbitrage for ${opportunity.symbol}`);
                  const result = await this.orderExecutor.executeArbitrage(opportunity);
                  
                  if (result && result.length > 0) {
                    this.logger.info(`✅ Successfully executed arbitrage for ${opportunity.symbol}`);
                  } else {
                    this.logger.warn(`⚠️ Failed to execute arbitrage for ${opportunity.symbol}`);
                  }
                } else {
                  this.logger.warn(`🚫 Risk check failed for ${opportunity.symbol}: ${riskAssessment.reason}`);
                }
              } catch (error) {
                this.logger.error(`❌ Error executing arbitrage for ${opportunity.symbol}:`, error);
              }
            }
          } else {
            this.logger.info('🔍 No profitable arbitrage opportunities found');
          }
        } catch (error) {
          this.logger.error('❌ Error in arbitrage analysis cycle:', error);
        }
      });
      
      this.isRunning = true;
      this.logger.info('🟢 Funding Rate Arbitrage Engine is now running in production mode');
      this.logger.info('📈 Monitoring for arbitrage opportunities...');
      
    } catch (error) {
      this.logger.error('❌ Failed to start Funding Rate Arbitrage Engine:', error);
      process.exit(1);
    }
  }

  private verifyProductionConfig(): void {
    const testnetFlags = [
      { name: 'BYBIT_TESTNET', value: process.env.BYBIT_TESTNET },
      { name: 'BITGET_SANDBOX', value: process.env.BITGET_SANDBOX },
      { name: 'KUCOIN_SANDBOX', value: process.env.KUCOIN_SANDBOX },
      { name: 'HYPERLIQUID_TESTNET', value: process.env.HYPERLIQUID_TESTNET }
    ];

    const activeTestnets = testnetFlags.filter(flag => flag.value === 'true');
    
    if (activeTestnets.length > 0) {
      this.logger.warn('⚠️ WARNING: Some exchanges are configured for testnet/sandbox mode:');
      activeTestnets.forEach(flag => {
        this.logger.warn(`   - ${flag.name}=true`);
      });
      this.logger.warn('⚠️ Make sure this is intentional for production trading!');
    } else {
      this.logger.info('✅ All exchanges configured for PRODUCTION mode');
    }

    // Verify required API keys are present
    const requiredKeys = [
      'BYBIT_API_KEY', 'BYBIT_API_SECRET',
      'BITGET_API_KEY', 'BITGET_API_SECRET', 'BITGET_PASSPHRASE',
      'KUCOIN_API_KEY', 'KUCOIN_API_SECRET', 'KUCOIN_PASSPHRASE',
      'HYPERLIQUID_PRIVATE_KEY',
      'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missingKeys = requiredKeys.filter(key => !process.env[key]);
    
    if (missingKeys.length > 0) {
      this.logger.error('❌ Missing required environment variables:');
      missingKeys.forEach(key => this.logger.error(`   - ${key}`));
      throw new Error('Missing required environment variables');
    }

    this.logger.info('✅ All required API keys are configured');
  }

  private async initializeServices(): Promise<void> {
    this.logger.info('🔧 Initializing services...');
    
    // Initialize SymbolMapper first
    const { SymbolMapper } = await import('./utils/symbolMapper');
    this.symbolMapper = SymbolMapper.getInstance();
    await this.symbolMapper.loadMappings();
    this.logger.info('✅ Symbol mappings loaded');
    
    // Initialize Bybit exchange
    const bybitExchange = new BybitExchange();
    await bybitExchange.connect();
    
    // Initialize BitGet exchange
    const bitgetExchange = new BitGetExchange();
    await bitgetExchange.connect();
    
    // Initialize KuCoin exchange
    const kucoinExchange = new KuCoinExchange();
    await kucoinExchange.connect();
    
    // Initialize Hyperliquid exchange
    const hyperliquidExchange = new HyperliquidExchange();
    await hyperliquidExchange.connect();
    
    // Add exchanges to services that need them
    this.dataCollector.addExchange(bybitExchange);
    this.dataCollector.addExchange(bitgetExchange);
    this.dataCollector.addExchange(kucoinExchange);
    this.dataCollector.addExchange(hyperliquidExchange);
    this.orderExecutor.addExchange(bybitExchange);
    this.orderExecutor.addExchange(bitgetExchange);
    this.orderExecutor.addExchange(kucoinExchange);
    this.orderExecutor.addExchange(hyperliquidExchange);
    this.positionMonitor.addExchange(bybitExchange);
    this.positionMonitor.addExchange(bitgetExchange);
    this.positionMonitor.addExchange(kucoinExchange);
    this.positionMonitor.addExchange(hyperliquidExchange);
    
    this.logger.info('✅ Bybit, BitGet, KuCoin, and Hyperliquid exchanges initialized');
    
    this.logger.info('✅ All services initialized successfully');
  }

  // Add method to manually reload symbol mappings
  async reloadSymbolMappings(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Engine is not running');
    }
    await this.symbolMapper.reloadMappings();
  }

  async stop(): Promise<void> {
    this.logger.info('🛑 Shutting down Funding Rate Arbitrage Engine...');
    
    this.isRunning = false;
    
    // Stop position monitoring
    this.positionMonitor.stop();
    
    this.logger.info('✅ Funding Rate Arbitrage Engine stopped');
  }

  getStatus(): { running: boolean } {
    return { running: this.isRunning };
  }
}

// Handle graceful shutdown
const engine = new FundingArbitrageEngine();

process.on('SIGINT', async () => {
  console.log('📡 Received SIGINT signal');
  await engine.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('📡 Received SIGTERM signal');
  await engine.stop();
  process.exit(0);
});

// Start the engine
engine.start().catch((error) => {
  console.error('❌ Failed to start engine:', error);
  process.exit(1);
});

export { FundingArbitrageEngine }; 