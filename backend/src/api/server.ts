import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { supabaseClient } from '../database/supabase.client';
import { Logger } from '../utils/logger';
import { ArbitrageAnalyzer } from '../services/ArbitrageAnalyzer';
import { DataCollector } from '../services/DataCollector';
import { TelegramBotService } from '../services/TelegramBot';

export class ApiServer {
  private app: express.Application;
  private logger: Logger;
  private port: number;
  private arbitrageAnalyzer?: ArbitrageAnalyzer;
  private dataCollector?: DataCollector;
  private telegramBot?: TelegramBotService;

  constructor(port: number = parseInt(process.env.PORT || '3001')) {
    this.app = express();
    this.logger = new Logger('ApiServer');
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS - Allow frontend to connect
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Request logging
    this.app.use(morgan('combined'));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Error handling middleware
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Dashboard data
    this.app.get('/api/dashboard', async (req, res) => {
      try {
        const dashboardData = await this.getDashboardData();
        res.json({
          success: true,
          data: dashboardData,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching dashboard data:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch dashboard data',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Live opportunities
    this.app.get('/api/opportunities', async (req, res) => {
      try {
        const opportunities = await this.getOpportunities();
        res.json({
          success: true,
          data: opportunities,
          count: opportunities.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching opportunities:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch opportunities',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Active positions
    this.app.get('/api/positions', async (req, res) => {
      try {
        const positions = await this.getPositions();
        res.json({
          success: true,
          data: positions,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching positions:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch positions',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Trade history
    this.app.get('/api/trades', async (req, res) => {
      try {
        const { limit = 50, offset = 0 } = req.query;
        const trades = await this.getTradeHistory(Number(limit), Number(offset));
        res.json({
          success: true,
          data: trades,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching trades:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch trades',
          timestamp: new Date().toISOString()
        });
      }
    });

    // System status
    this.app.get('/api/status', async (req, res) => {
      this.logger.info('Received status request');
      try {
        const status = await this.getSystemStatus();
        this.logger.info('Status response:', status);
        res.json({
          success: true,
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching system status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch system status',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Execute opportunity (POST)
    this.app.post('/api/opportunities/:id/execute', async (req, res) => {
      try {
        if (!this.arbitrageAnalyzer) {
          throw new Error('Arbitrage analyzer service not initialized');
        }

        const opportunityId = req.params.id;
        const result = await this.executeOpportunity(opportunityId);
        
        if (result.success) {
          res.json({
            success: true,
            message: `Opportunity ${opportunityId} executed successfully`,
            strategyId: result.strategyId,
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(400).json({
            success: false,
            error: result.error || 'Failed to execute opportunity',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        this.logger.error('Error executing opportunity:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date().toISOString()
      });
    });
  }

  // Data fetching methods
  private async getDashboardData() {
    try {
      if (!this.dataCollector || !this.arbitrageAnalyzer) {
        throw new Error('Required services not initialized');
      }

      // Get recent opportunities
      const { data: opportunities } = await supabaseClient
        .from('arbitrage_opportunities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      // Get active positions
      const { data: positions } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('status', 'open');

      // Get trades
      const { data: trades } = await supabaseClient
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!opportunities || !positions || !trades) {
        throw new Error('Failed to fetch required data from database');
      }

      // Calculate stats
      const totalPnl = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthlyTrades = trades.filter(trade => 
        new Date(trade.created_at) >= monthStart
      );
      
      const monthlyPnl = monthlyTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
      const totalTrades = trades.length;
      const winningTrades = trades.filter(trade => trade.pnl > 0).length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const avgProfit = totalTrades > 0 ? totalPnl / totalTrades : 0;
      
      // Calculate average duration
      const durations = trades.map(trade => {
        const start = new Date(trade.created_at).getTime();
        const end = trade.closed_at ? new Date(trade.closed_at).getTime() : Date.now();
        return (end - start) / (1000 * 60 * 60); // Convert to hours
      });
      const avgDuration = durations.length > 0 
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length 
        : 0;

      // Get margin information from data collector
      const marginInfo = await this.dataCollector.getMarginInfo();
      const { marginUsed, marginAvailable, marginUtilization } = marginInfo;

      // Get volume information
      const dailyVolume = await this.dataCollector.getDailyVolume();
      const monthlyVolume = await this.dataCollector.getMonthlyVolume();

      // Prepare activities feed
      const activities = [
        ...(opportunities.map(opp => ({
          type: 'opportunity' as const,
          message: `New ${opp.symbol} opportunity found with ${opp.profit_bps}bps profit potential`,
          time: opp.created_at
        }))),
        ...(trades.map(trade => ({
          type: 'trade' as const,
          message: `${trade.side} ${trade.symbol} trade ${trade.status} with ${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)} USD`,
          time: trade.created_at
        }))),
        ...(positions.map(pos => ({
          type: 'position' as const,
          message: `${pos.side} ${pos.symbol} position opened at ${pos.entry_price}`,
          time: pos.created_at
        })))
      ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 20);

      return {
        stats: {
          totalPnl,
          monthlyPnl,
          totalTrades,
          winRate,
          avgProfit,
          avgDuration,
          activePositions: positions.length,
          marginUsed,
          marginAvailable,
          marginUtilization,
          dailyVolume,
          monthlyVolume
        },
        activities
      };
    } catch (error) {
      this.logger.error('Error generating dashboard data:', error);
      throw error;
    }
  }

  private async getOpportunities() {
    try {
      if (!this.arbitrageAnalyzer) {
        throw new Error('Arbitrage analyzer service not initialized');
      }

      const { data: opportunities } = await supabaseClient
        .from('arbitrage_opportunities')
        .select('*')
        .eq('status', 'identified')
        .order('estimated_profit', { ascending: false })
        .limit(20);

      if (!opportunities) {
        return [];
      }

      return opportunities.map(opp => ({
        id: opp.id,
        symbol: opp.symbol,
        longExchange: opp.long_exchange,
        shortExchange: opp.short_exchange,
        longFundingRate: opp.long_funding_rate,
        shortFundingRate: opp.short_funding_rate,
        fundingRateDiff: opp.funding_rate_diff,
        arbBasisPoints: opp.arb_basis_points,
        estimatedProfit: opp.estimated_profit,
        confidence: opp.confidence,
        riskScore: opp.risk_score,
        status: opp.status,
        createdAt: opp.created_at
      }));
    } catch (error) {
      this.logger.error('Error getting opportunities:', error);
      throw error;
    }
  }

  private async getPositions() {
    try {
      const { data: positions } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      return positions || [];
    } catch (error) {
      this.logger.error('Error getting positions:', error);
      throw error;
    }
  }

  private async getTradeHistory(limit: number, offset: number) {
    try {
      const { data: trades } = await supabaseClient
        .from('trades')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      return trades || [];
    } catch (error) {
      this.logger.error('Error getting trade history:', error);
      throw error;
    }
  }

  private async getSystemStatus() {
    // For development, always return operational status
    return {
      status: 'operational',
      lastUpdate: new Date().toISOString(),
      activeOpportunities: 0,
      activeTrades: 0,
      dailyPnL: 0
    };
  }

  private async executeOpportunity(opportunityId: string) {
    try {
      if (!this.arbitrageAnalyzer) {
        throw new Error('Arbitrage analyzer service not initialized');
      }

      const result = await this.arbitrageAnalyzer.executeOpportunity(opportunityId);
      return {
        success: result.success,
        strategyId: result.strategyId,
        error: result.error
      };
    } catch (error) {
      this.logger.error('Error executing opportunity:', error);
      throw error;
    }
  }

  public setServices(
    arbitrageAnalyzer: ArbitrageAnalyzer,
    dataCollector: DataCollector,
    telegramBot: TelegramBotService
  ) {
    this.arbitrageAnalyzer = arbitrageAnalyzer;
    this.dataCollector = dataCollector;
    this.telegramBot = telegramBot;
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        this.logger.info(`🚀 API Server running on port ${this.port}`);
        resolve();
      });
    });
  }
}

export default ApiServer; 