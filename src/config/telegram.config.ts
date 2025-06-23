import 'dotenv/config';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  alerts: {
    signals: boolean;
    trades: boolean;
    positions: boolean;
    errors: boolean;
    riskWarnings: boolean;
  };
  throttle: {
    maxMessagesPerMinute: number;
    cooldownMs: number;
  };
}

export const telegramConfig: TelegramConfig = {
  enabled: process.env.TELEGRAM_ENABLED === 'true',
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  alerts: {
    signals: process.env.TELEGRAM_ALERT_SIGNALS !== 'false',
    trades: process.env.TELEGRAM_ALERT_TRADES !== 'false',
    positions: process.env.TELEGRAM_ALERT_POSITIONS !== 'false',
    errors: process.env.TELEGRAM_ALERT_ERRORS !== 'false',
    riskWarnings: process.env.TELEGRAM_ALERT_RISK_WARNINGS !== 'false',
  },
  throttle: {
    maxMessagesPerMinute: parseInt(process.env.TELEGRAM_MAX_MESSAGES_PER_MINUTE || '30'),
    cooldownMs: parseInt(process.env.TELEGRAM_COOLDOWN_MS || '2000'),
  },
}; 