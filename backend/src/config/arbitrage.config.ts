import { ArbitrageConfig, TelegramConfig } from './interfaces/IExchangeConfig';

declare const process: NodeJS.Process;

export const arbitrageConfig: ArbitrageConfig = {
  minArbBps: parseInt(process.env.MIN_ARB_BPS || '30'),
  minFundingRateThreshold: parseFloat(process.env.MIN_FUNDING_RATE_THRESHOLD || '0.40'),
  analysisWindowHours: parseInt(process.env.ANALYSIS_WINDOW_HOURS || '72'),
  maxPositionSize: parseInt(process.env.MAX_POSITION_SIZE || '1000'),
  killSwitchThresholds: {
    nearLiquidationPercent: parseInt(process.env.KILL_SWITCH_LIQUIDATION_PERCENT || '80'),
    maxDrawdownPercent: parseInt(process.env.KILL_SWITCH_DRAWDOWN_PERCENT || '10'),
  },
  riskManagement: {
    totalCapital: parseInt(process.env.TOTAL_CAPITAL || '5000'),
    positionSizePercent: parseInt(process.env.POSITION_SIZE_PERCENT || '20'),
    maxConcurrentPositions: 3, // Conservative for MVP
  },
};

export const telegramConfig: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
}; 