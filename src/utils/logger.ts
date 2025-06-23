import winston from 'winston';
import * as dotenv from 'dotenv';

dotenv.config();

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${
        Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : ''
      }`;
    })
  ),
  defaultMeta: { service: 'funding-arbitrage' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// Create logs directory if it doesn't exist
import * as fs from 'fs';
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Helper functions for structured logging
export interface KillSwitchLogData {
  strategyId: string;
  reason: string;
  timestamp: Date;
  action: string;
}

export interface TradeLogData {
  action: string;
  strategyId?: string;
  baseSymbol: string;
  longExchange?: string;
  shortExchange?: string;
  longPrice?: number;
  shortPrice?: number;
  size?: number;
  expectedProfitBps?: number;
  success: boolean;
  exchange?: string;
  symbol?: string;
  side?: string;
  quantity?: number;
  price?: number;
  error?: string;
}

export const logKillSwitch = (data: KillSwitchLogData): void => {
  logger.warn('Kill Switch Activated', data);
};

export const logTrade = (data: TradeLogData): void => {
  if (data.success) {
    logger.info('Trade Executed', data);
  } else {
    logger.error('Trade Failed', data);
  }
};

export const logArbitrage = (data: {
  action: string;
  baseSymbol: string;
  longExchange: string;
  shortExchange: string;
  profitBps: number;
  size: number;
  success: boolean;
  error?: string;
}) => {
  logger.info('Arbitrage opportunity', data);
};

export const logPosition = (data: {
  action: string;
  strategyId: string;
  exchange: string;
  symbol: string;
  side: string;
  size: number;
  pnl?: number;
  status: string;
}) => {
  logger.info('Position update', data);
};

export const logError = (error: Error, context?: any) => {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    context,
  });
};

export const logPerformance = (data: {
  metric: string;
  value: number;
  unit: string;
  timestamp: Date;
}) => {
  logger.info('Performance metric', data);
}; 