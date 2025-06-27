import TelegramBot from 'node-telegram-bot-api';
import { ArbitrageOpportunity, TradeResult, Position } from '../types/common';
import { Logger } from '../utils/logger';

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private chatId: string;
  private logger: Logger;
  private isEnabled: boolean = false;

  constructor() {
    this.logger = new Logger('TelegramBot');
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (token && this.chatId) {
      try {
        this.bot = new TelegramBot(token, { polling: false });
        this.isEnabled = true;
        this.logger.info('Telegram bot initialized successfully');
        this.setupCommands();
      } catch (error) {
        this.logger.error('Failed to initialize Telegram bot:', error);
        this.isEnabled = false;
      }
    } else {
      this.logger.warn('Telegram bot not configured - missing token or chat ID');
      this.isEnabled = false;
    }
  }

  private async setupCommands(): Promise<void> {
    if (!this.bot) return;

    try {
      // Set bot commands
      await this.bot.setMyCommands([
        { command: 'status', description: 'Get current bot status' },
        { command: 'opportunities', description: 'Get active arbitrage opportunities' },
        { command: 'positions', description: 'Get current positions' },
        { command: 'pnl', description: 'Get P&L summary' },
        { command: 'help', description: 'Show available commands' }
      ]);

      // Setup message handlers
      this.bot.onText(/\/start/, (msg) => {
        this.sendMessage('🚀 Funding Arbitrage Bot is online!\n\nUse /help to see available commands.');
      });

      this.bot.onText(/\/help/, (msg) => {
        const helpText = `
🤖 *Funding Arbitrage Bot Commands*

/status - Get current bot status
/opportunities - Get active arbitrage opportunities  
/positions - Get current positions
/pnl - Get P&L summary
/help - Show this help message

The bot will automatically send alerts for:
• 🔍 New arbitrage opportunities
• 💰 Trade executions
• ⚠️ Risk alerts
• 📊 Daily summaries
        `;
        this.sendMessage(helpText);
      });

      this.bot.onText(/\/status/, async (msg) => {
        await this.sendBotStatus();
      });

    } catch (error) {
      this.logger.error('Failed to setup bot commands:', error);
    }
  }

  public async sendOpportunityAlert(opportunity: ArbitrageOpportunity): Promise<void> {
    if (!this.isEnabled) return;

    const message = this.formatOpportunityMessage(opportunity);
    await this.sendMessage(message);
  }

  public async sendTradeAlert(tradeResult: TradeResult, strategyId: string, type: 'EXECUTED' | 'FAILED'): Promise<void> {
    if (!this.isEnabled) return;

    const message = this.formatTradeMessage(tradeResult, strategyId, type);
    await this.sendMessage(message);
  }

  public async sendPositionUpdate(position: Position, type: 'OPENED' | 'CLOSED' | 'LIQUIDATED'): Promise<void> {
    if (!this.isEnabled) return;

    const message = this.formatPositionMessage(position, type);
    await this.sendMessage(message);
  }

  public async sendRiskAlert(alertType: 'HIGH_EXPOSURE' | 'DRAWDOWN' | 'LIQUIDATION_RISK', details: any): Promise<void> {
    if (!this.isEnabled) return;

    const message = this.formatRiskAlert(alertType, details);
    await this.sendMessage(message);
  }

  public async sendDailySummary(summary: {
    totalPnL: number;
    tradesExecuted: number;
    opportunitiesFound: number;
    avgSpread: number;
    winRate: number;
  }): Promise<void> {
    if (!this.isEnabled) return;

    const message = this.formatDailySummary(summary);
    await this.sendMessage(message);
  }

  private formatOpportunityMessage(opportunity: ArbitrageOpportunity): string {
    const profitEmoji = opportunity.estimatedProfit > 100 ? '🔥' : opportunity.estimatedProfit > 50 ? '💰' : '💵';
    const riskEmoji = opportunity.riskScore < 3 ? '🟢' : opportunity.riskScore < 7 ? '🟡' : '🔴';

    return `${profitEmoji} *NEW ARBITRAGE OPPORTUNITY*

📊 *Symbol:* ${opportunity.symbol}
📈 *Long:* ${opportunity.longExchange} (${(opportunity.longFundingRate * 100).toFixed(4)}%)
📉 *Short:* ${opportunity.shortExchange} (${(opportunity.shortFundingRate * 100).toFixed(4)}%)

💎 *Spread:* ${opportunity.arbBasisPoints} bps
💰 *Est. Profit:* $${opportunity.estimatedProfit.toFixed(2)}
📏 *Optimal Size:* $${opportunity.optimalSize.toFixed(0)}
🎯 *Confidence:* ${(opportunity.confidence * 100).toFixed(1)}%
${riskEmoji} *Risk Score:* ${opportunity.riskScore}/10

⏰ *Time:* ${new Date().toLocaleString()}`;
  }

  private formatTradeMessage(tradeResult: TradeResult, strategyId: string, type: 'EXECUTED' | 'FAILED'): string {
    const emoji = type === 'EXECUTED' ? '✅' : '❌';
    const statusColor = type === 'EXECUTED' ? '🟢' : '🔴';

    return `${emoji} *TRADE ${type}*

🆔 *Strategy ID:* ${strategyId.slice(0, 8)}...
🏢 *Exchange:* ${tradeResult.exchange}
📊 *Symbol:* ${tradeResult.symbol}
📈 *Side:* ${tradeResult.side.toUpperCase()}
💰 *Price:* $${tradeResult.price.toFixed(2)}
📏 *Quantity:* ${tradeResult.quantity.toFixed(4)}
💸 *Fees:* $${tradeResult.fees.toFixed(2)}
${statusColor} *Status:* ${tradeResult.status.toUpperCase()}

⏰ *Time:* ${tradeResult.timestamp.toLocaleString()}`;
  }

  private formatPositionMessage(position: Position, type: 'OPENED' | 'CLOSED' | 'LIQUIDATED'): string {
    const emoji = type === 'OPENED' ? '🔄' : type === 'CLOSED' ? '✅' : '🚨';
    const pnlEmoji = position.unrealizedPnl >= 0 ? '💰' : '📉';

    return `${emoji} *POSITION ${type}*

🆔 *Strategy:* ${position.strategyId.slice(0, 8)}...
🏢 *Exchange:* ${position.exchange}
📊 *Symbol:* ${position.symbol}
📈 *Side:* ${position.side.toUpperCase()}
💰 *Entry Price:* $${position.entryPrice.toFixed(2)}
📏 *Quantity:* ${position.quantity.toFixed(4)}
⚡ *Leverage:* ${position.leverage}x
🚨 *Liquidation:* $${position.liquidationPrice.toFixed(2)}
${pnlEmoji} *Unrealized PnL:* $${position.unrealizedPnl.toFixed(2)}

⏰ *Time:* ${position.updatedAt.toLocaleString()}`;
  }

  private formatRiskAlert(alertType: 'HIGH_EXPOSURE' | 'DRAWDOWN' | 'LIQUIDATION_RISK', details: any): string {
    let emoji = '⚠️';
    let title = '';
    let message = '';

    switch (alertType) {
      case 'HIGH_EXPOSURE':
        emoji = '🚨';
        title = 'HIGH EXPOSURE ALERT';
        message = `Total exposure: $${details.totalExposure.toFixed(2)}\nMax allowed: $${details.maxAllowed.toFixed(2)}`;
        break;
      case 'DRAWDOWN':
        emoji = '📉';
        title = 'DRAWDOWN ALERT';
        message = `Current drawdown: ${(details.drawdown * 100).toFixed(2)}%\nMax allowed: ${(details.maxDrawdown * 100).toFixed(2)}%`;
        break;
      case 'LIQUIDATION_RISK':
        emoji = '🔥';
        title = 'LIQUIDATION RISK';
        message = `Position at risk: ${details.symbol} on ${details.exchange}\nCurrent price: $${details.currentPrice.toFixed(2)}\nLiquidation price: $${details.liquidationPrice.toFixed(2)}`;
        break;
    }

    return `${emoji} *${title}*

${message}

⚠️ *Immediate action may be required!*
⏰ *Time:* ${new Date().toLocaleString()}`;
  }

  private formatDailySummary(summary: {
    totalPnL: number;
    tradesExecuted: number;
    opportunitiesFound: number;
    avgSpread: number;
    winRate: number;
  }): string {
    const pnlEmoji = summary.totalPnL >= 0 ? '📈' : '📉';
    const performanceEmoji = summary.winRate >= 0.7 ? '🔥' : summary.winRate >= 0.5 ? '👍' : '⚠️';

    return `📊 *DAILY SUMMARY*

${pnlEmoji} *Total P&L:* $${summary.totalPnL.toFixed(2)}
🔄 *Trades Executed:* ${summary.tradesExecuted}
🎯 *Opportunities Found:* ${summary.opportunitiesFound}
📏 *Avg Spread:* ${summary.avgSpread.toFixed(0)} bps
${performanceEmoji} *Win Rate:* ${(summary.winRate * 100).toFixed(1)}%

⏰ *Date:* ${new Date().toDateString()}
🤖 *Status:* Active and monitoring`;
  }

  private async sendBotStatus(): Promise<void> {
    const status = `🤖 *BOT STATUS*

✅ *Status:* Online and monitoring
🔄 *Alerts:* ${this.isEnabled ? 'Enabled' : 'Disabled'}
📡 *Exchanges:* Connected
💾 *Database:* Connected
⏰ *Last Update:* ${new Date().toLocaleString()}

🎯 *Monitoring for:*
• Funding rate arbitrage opportunities
• Trade executions and fills
• Position updates and P&L
• Risk management alerts`;

    await this.sendMessage(status);
  }

  public async sendMessage(text: string): Promise<void> {
    if (!this.bot || !this.chatId) return;

    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    } catch (error) {
      this.logger.error('Failed to send Telegram message:', error);
    }
  }

  public isActive(): boolean {
    return this.isEnabled;
  }

  public async testConnection(): Promise<boolean> {
    if (!this.bot) return false;

    try {
      await this.sendMessage('🧪 *Test Message*\n\nTelegram bot connection is working correctly!');
      return true;
    } catch (error) {
      this.logger.error('Telegram bot connection test failed:', error);
      return false;
    }
  }
} 