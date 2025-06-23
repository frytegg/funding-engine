import { Telegraf, Context } from 'telegraf';
import { telegramConfig } from '../config/telegram.config';
import { logger } from '../utils/logger';
import { RateLimiter } from '../utils/helpers';
import { formatCurrency, formatPercentage } from '../utils/helpers';

interface SystemStatus {
  isRunning: boolean;
  activeStrategies: number;
  activePositions: number;
  totalPnL: number;
  uptime: number;
}

export class TelegramService {
  private static instance: TelegramService;
  private bot: Telegraf;
  private rateLimiter: RateLimiter;
  private messageQueue: { message: string; type: string }[] = [];
  private isProcessingQueue = false;
  private systemStatus: SystemStatus = {
    isRunning: false,
    activeStrategies: 0,
    activePositions: 0,
    totalPnL: 0,
    uptime: 0
  };
  private startTime: number = Date.now();
  private adminUsers: Set<string> = new Set([telegramConfig.chatId]); // Admin list

  private constructor() {
    if (!telegramConfig.enabled) {
      throw new Error('Telegram service is not enabled');
    }
    if (!telegramConfig.botToken) {
      throw new Error('Telegram bot token is not configured');
    }
    if (!telegramConfig.chatId) {
      throw new Error('Telegram chat ID is not configured');
    }

    this.bot = new Telegraf(telegramConfig.botToken);
    this.rateLimiter = new RateLimiter(
      telegramConfig.throttle.maxMessagesPerMinute,
      60000 // 1 minute window
    );

    this.setupBot();
    this.systemStatus.isRunning = true;
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  private setupBot(): void {
    // Handle start command
    this.bot.command('start', (ctx: Context) => {
      ctx.reply('🤖 Funding Arbitrage Bot is running! Use /help to see available commands.');
    });

    // Handle help command
    this.bot.command('help', (ctx: Context) => {
      const helpText = `
<b>Available Commands:</b>

🔍 Monitoring:
/status - Get current bot status
/positions - List active positions
/balance - Show account balance
/risk - Show risk metrics

⚙️ Control:
/stop - Emergency stop (admin only)
/resume - Resume operations (admin only)

📊 Statistics:
/stats - Show trading statistics
/performance - Show performance metrics
      `.trim();
      ctx.reply(helpText, { parse_mode: 'HTML' });
    });

    // Handle status command
    this.bot.command('status', async (ctx: Context) => {
      try {
        const status = await this.getSystemStatus();
        ctx.reply(status, { parse_mode: 'HTML' });
      } catch (error: unknown) {
        ctx.reply('Error fetching system status');
        if (error instanceof Error) {
          logger.error('Error in status command:', error);
        }
      }
    });

    // Handle positions command
    this.bot.command('positions', async (ctx: Context) => {
      try {
        const positions = await this.getActivePositions();
        ctx.reply(positions, { parse_mode: 'HTML' });
      } catch (error: unknown) {
        ctx.reply('Error fetching positions');
        logger.error('Error in positions command:', error);
      }
    });

    // Handle balance command
    this.bot.command('balance', async (ctx: Context) => {
      try {
        const balance = await this.getAccountBalance();
        ctx.reply(balance, { parse_mode: 'HTML' });
      } catch (error: unknown) {
        ctx.reply('Error fetching balance');
        logger.error('Error in balance command:', error);
      }
    });

    // Handle risk command
    this.bot.command('risk', async (ctx: Context) => {
      try {
        const risk = await this.getRiskMetrics();
        ctx.reply(risk, { parse_mode: 'HTML' });
      } catch (error: unknown) {
        ctx.reply('Error fetching risk metrics');
        logger.error('Error in risk command:', error);
      }
    });

    // Handle stop command (admin only)
    this.bot.command('stop', async (ctx: Context) => {
      if (!this.isAdmin(ctx)) {
        ctx.reply('⛔ This command is restricted to administrators');
        return;
      }
      try {
        await this.stopTrading();
        ctx.reply('🛑 Trading has been stopped. Use /resume to restart.');
      } catch (error: unknown) {
        ctx.reply('Error stopping trading');
        logger.error('Error in stop command:', error);
      }
    });

    // Handle resume command (admin only)
    this.bot.command('resume', async (ctx: Context) => {
      if (!this.isAdmin(ctx)) {
        ctx.reply('⛔ This command is restricted to administrators');
        return;
      }
      try {
        await this.resumeTrading();
        ctx.reply('✅ Trading has been resumed');
      } catch (error: unknown) {
        ctx.reply('Error resuming trading');
        logger.error('Error in resume command:', error);
      }
    });

    // Start the bot
    this.bot.launch().catch((error: unknown) => {
      if (error instanceof Error) {
        logger.error('Failed to start Telegram bot:', error);
      }
    });

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  private isAdmin(ctx: Context): boolean {
    return this.adminUsers.has(ctx.chat?.id.toString() || '');
  }

  private async getSystemStatus(): Promise<string> {
    const uptimeHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
    
    return `
🤖 <b>System Status</b>

Status: ${this.systemStatus.isRunning ? '🟢 Running' : '🔴 Stopped'}
Uptime: ${uptimeHours.toFixed(1)} hours
Active Strategies: ${this.systemStatus.activeStrategies}
Active Positions: ${this.systemStatus.activePositions}
Total PnL: ${formatCurrency(this.systemStatus.totalPnL)}
    `.trim();
  }

  private async getActivePositions(): Promise<string> {
    // This will be implemented to fetch actual position data
    return `
📊 <b>Active Positions</b>

No active positions at the moment.
    `.trim();
  }

  private async getAccountBalance(): Promise<string> {
    // This will be implemented to fetch actual balance data
    return `
💰 <b>Account Balance</b>

Total Balance: ${formatCurrency(0)}
Available: ${formatCurrency(0)}
In Position: ${formatCurrency(0)}
    `.trim();
  }

  private async getRiskMetrics(): Promise<string> {
    // This will be implemented to fetch actual risk metrics
    return `
⚠️ <b>Risk Metrics</b>

Daily Drawdown: ${formatPercentage(0)}
Position Risk: Low
Margin Usage: ${formatPercentage(0)}
    `.trim();
  }

  private async stopTrading(): Promise<void> {
    this.systemStatus.isRunning = false;
    logger.info('Trading stopped via Telegram command');
    // Additional stop logic will be implemented
  }

  private async resumeTrading(): Promise<void> {
    this.systemStatus.isRunning = true;
    logger.info('Trading resumed via Telegram command');
    // Additional resume logic will be implemented
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      if (!await this.rateLimiter.tryAcquire()) {
        await new Promise(resolve => setTimeout(resolve, telegramConfig.throttle.cooldownMs));
        continue;
      }

      const { message, type } = this.messageQueue.shift()!;

      try {
        await this.bot.telegram.sendMessage(telegramConfig.chatId, message, {
          parse_mode: 'HTML'
        });
        logger.debug(`Sent Telegram ${type} alert`);
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error(`Failed to send Telegram ${type} alert:`, error);
        }
        // If it's an important message, add it back to the queue
        if (['error', 'critical'].includes(type)) {
          this.messageQueue.unshift({ message, type });
        }
      }

      await new Promise(resolve => setTimeout(resolve, telegramConfig.throttle.cooldownMs));
    }

    this.isProcessingQueue = false;
  }

  // Public methods for different types of alerts

  public async sendSignalAlert(signal: {
    symbol: string;
    longExchange: string;
    shortExchange: string;
    fundingRate: number;
    expectedReturn: number;
  }): Promise<void> {
    if (!telegramConfig.enabled || !telegramConfig.alerts.signals) return;

    const message = `
🎯 <b>New Arbitrage Signal</b>

Symbol: ${signal.symbol}
Long: ${signal.longExchange}
Short: ${signal.shortExchange}
Funding Rate: ${(signal.fundingRate * 100).toFixed(4)}%
Expected Return: ${(signal.expectedReturn * 100).toFixed(2)}%
    `.trim();

    this.messageQueue.push({ message, type: 'signal' });
    this.processMessageQueue();
  }

  public async sendTradeAlert(trade: {
    strategyId: string;
    symbol: string;
    type: 'open' | 'close';
    longExchange?: string;
    shortExchange?: string;
    quantity?: number;
    pnl?: number;
  }): Promise<void> {
    if (!telegramConfig.enabled || !telegramConfig.alerts.trades) return;

    let message: string;
    if (trade.type === 'open') {
      message = `
🔵 <b>New Trade Opened</b>

Strategy ID: ${trade.strategyId}
Symbol: ${trade.symbol}
Long: ${trade.longExchange}
Short: ${trade.shortExchange}
Size: ${trade.quantity} units
      `;
    } else {
      message = `
🟢 <b>Trade Closed</b>

Strategy ID: ${trade.strategyId}
Symbol: ${trade.symbol}
PnL: ${trade.pnl?.toFixed(2)} USDT
      `;
    }

    this.messageQueue.push({ message: message.trim(), type: 'trade' });
    this.processMessageQueue();
  }

  public async sendPositionAlert(position: {
    strategyId: string;
    symbol: string;
    exchange: string;
    side: string;
    unrealizedPnl: number;
    liquidationPrice?: number;
    currentPrice: number;
    warning?: string;
  }): Promise<void> {
    if (!telegramConfig.enabled || !telegramConfig.alerts.positions) return;

    const message = `
📊 <b>Position Update</b>

Strategy: ${position.strategyId}
Symbol: ${position.symbol}
Exchange: ${position.exchange}
Side: ${position.side}
Unrealized PnL: ${position.unrealizedPnl.toFixed(2)} USDT
Current Price: ${position.currentPrice}
${position.liquidationPrice ? `Liquidation Price: ${position.liquidationPrice}` : ''}
${position.warning ? `⚠️ Warning: ${position.warning}` : ''}
    `.trim();

    this.messageQueue.push({ message, type: 'position' });
    this.processMessageQueue();
  }

  public async sendErrorAlert(error: {
    context: string;
    message: string;
    critical?: boolean;
    strategyId?: string;
  }): Promise<void> {
    if (!telegramConfig.enabled || !telegramConfig.alerts.errors) return;

    const message = `
${error.critical ? '🔴' : '⚠️'} <b>${error.critical ? 'Critical Error' : 'Error'}</b>

Context: ${error.context}
${error.strategyId ? `Strategy: ${error.strategyId}` : ''}
Message: ${error.message}
Time: ${new Date().toISOString()}
    `.trim();

    this.messageQueue.push({ 
      message, 
      type: error.critical ? 'critical' : 'error' 
    });
    this.processMessageQueue();
  }

  public async sendRiskWarning(warning: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    metrics?: Record<string, any>;
  }): Promise<void> {
    if (!telegramConfig.enabled || !telegramConfig.alerts.riskWarnings) return;

    const emoji = {
      LOW: '✅',
      MEDIUM: '⚠️',
      HIGH: '🚨',
      CRITICAL: '🔴'
    };

    let metricsText = '';
    if (warning.metrics) {
      metricsText = '\n\nMetrics:\n' + Object.entries(warning.metrics)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    }

    const message = `
${emoji[warning.level]} <b>Risk Warning - ${warning.level}</b>

${warning.message}${metricsText}
    `.trim();

    this.messageQueue.push({ message, type: 'risk' });
    this.processMessageQueue();
  }
} 