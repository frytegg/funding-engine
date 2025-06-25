import dotenv from 'dotenv';
import { Logger } from './utils/logger';
import { DataCollector } from './services/DataCollector';
import { ArbitrageAnalyzer } from './services/ArbitrageAnalyzer';
import { OrderExecutor } from './services/OrderExecutor';
import { PositionMonitor } from './services/PositionMonitor';
import { RiskManager } from './services/RiskManager';
import { BybitExchange } from './exchanges/bybit/BybitExchange';
import { bybitConfig } from './config/exchanges/bybit.config';
import * as cron from 'node-cron';

// Load environment variables
dotenv.config();

class FundingArbitrageEngine {
  private logger: Logger;
  private dataCollector: DataCollector;
  private arbitrageAnalyzer: ArbitrageAnalyzer;
  private orderExecutor: OrderExecutor;
  private positionMonitor: PositionMonitor;
  private riskManager: RiskManager;
  private isRunning: boolean = false;

  constructor() {
    this.logger = new Logger('FundingEngine');
    this.dataCollector = new DataCollector();
    this.arbitrageAnalyzer = new ArbitrageAnalyzer(this.dataCollector);
    this.orderExecutor = new OrderExecutor();
    this.positionMonitor = new PositionMonitor();
    this.riskManager = new RiskManager();
  }

  async start(): Promise<void> {
    try {
      this.logger.info('🚀 Starting Funding Rate Arbitrage Engine in PRODUCTION mode');
      
      // Verify environment is set to production
      this.verifyProductionConfig();
      
      // Initialize services
      await this.initializeServices();
      
      // Start position monitoring (runs continuously)
      this.positionMonitor.start();
      this.logger.info('📊 Position monitoring started');
      
      // Start data collection (every 5 minutes)
      cron.schedule('*/5 * * * *', async () => {
        try {
          this.logger.info('🔄 Starting data collection cycle');
          await this.dataCollector.collectHistoricalFundingRates(72);
          this.logger.info('✅ Data collection cycle completed');
        } catch (error) {
          this.logger.error('❌ Error in data collection cycle:', error);
        }
      });
      
      // Start arbitrage analysis (every 10 minutes)
      cron.schedule('*/10 * * * *', async () => {
        try {
          this.logger.info('🔍 Starting arbitrage analysis cycle');
          const opportunities = await this.arbitrageAnalyzer.analyzeOpportunities();
          
          if (opportunities.length > 0) {
            this.logger.info(`💰 Found ${opportunities.length} arbitrage opportunities`);
            
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
    
    // Initialize Bybit exchange
    const bybitExchange = new BybitExchange();
    await bybitExchange.connect();
    
    // Add exchanges to services that need them
    this.dataCollector.addExchange(bybitExchange);
    this.positionMonitor.addExchange(bybitExchange);
    
    // TODO: Initialize other exchanges (Bitget, KuCoin, Hyperliquid) here
    this.logger.warn('⚠️ Only Bybit exchange is currently implemented');
    
    this.logger.info('✅ All services initialized successfully');
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