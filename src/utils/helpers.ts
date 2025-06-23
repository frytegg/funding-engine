import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const generateUUID = (): string => {
  return uuidv4();
};

export const roundToDecimals = (value: number, decimals: number): number => {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return (value / total) * 100;
};

export const calculateBasisPoints = (value: number, reference: number): number => {
  if (reference === 0) return 0;
  return ((value - reference) / reference) * 10000;
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

export function formatPercentage(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

export const formatBasisPoints = (value: number): string => {
  return `${roundToDecimals(value, 2)} bps`;
};

export const calculateLiquidationPrice = (
  entryPrice: number,
  leverage: number,
  side: 'long' | 'short',
  maintenanceMargin = 0.005 // 0.5% default
): number => {
  if (side === 'long') {
    return entryPrice * (1 - (1 / leverage) + maintenanceMargin);
  } else {
    return entryPrice * (1 + (1 / leverage) - maintenanceMargin);
  }
};

export const calculatePnL = (
  entryPrice: number,
  currentPrice: number,
  quantity: number,
  side: 'long' | 'short'
): number => {
  if (side === 'long') {
    return (currentPrice - entryPrice) * quantity;
  } else {
    return (entryPrice - currentPrice) * quantity;
  }
};

export const calculateRequiredMargin = (
  price: number,
  quantity: number,
  leverage: number
): number => {
  return (price * quantity) / leverage;
};

export const normalizeSymbol = (symbol: string): string => {
  return symbol.toUpperCase().replace(/[^A-Z]/g, '');
};

export const parseSymbol = (symbol: string): { base: string; quote: string } => {
  const parts = symbol.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid symbol format: ${symbol}`);
  }
  return {
    base: parts[0].toUpperCase(),
    quote: parts[1].toUpperCase(),
  };
};

export const calculateOptimalOrderSize = (
  availableLiquidity: number,
  maxCapital: number,
  maxSlippagePercent: number,
  currentPrice: number
): number => {
  // Calculate maximum size based on liquidity and slippage
  const maxSizeByLiquidity = availableLiquidity * (maxSlippagePercent / 100);
  
  // Calculate maximum size based on capital
  const maxSizeByCapital = maxCapital / currentPrice;
  
  // Return the smaller of the two
  return Math.min(maxSizeByLiquidity, maxSizeByCapital);
};

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        logger.error(`Function failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      const delay = baseDelay * Math.pow(backoffFactor, attempt);
      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
      await sleep(delay);
    }
  }
  
  throw lastError!;
};

export const calculateFundingRateAverage = (rates: number[]): number => {
  if (rates.length === 0) return 0;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
};

export const calculateVolatility = (prices: number[]): number => {
  if (prices.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
};

export const isWithinTimeWindow = (
  timestamp: Date,
  windowStart: Date,
  windowEnd: Date
): boolean => {
  return timestamp >= windowStart && timestamp <= windowEnd;
};

export const getCurrentTimestamp = (): Date => {
  return new Date();
};

export const getTimestamp = (hoursAgo: number): Date => {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
};

export const formatTimestamp = (timestamp: Date): string => {
  return timestamp.toISOString();
};

export const validateNumber = (value: any, name: string): number => {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    throw new Error(`Invalid number for ${name}: ${value}`);
  }
  return num;
};

export const validatePositiveNumber = (value: any, name: string): number => {
  const num = validateNumber(value, name);
  if (num <= 0) {
    throw new Error(`${name} must be positive: ${value}`);
  }
  return num;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const calculateWeightedAverage = (
  values: number[],
  weights: number[]
): number => {
  if (values.length !== weights.length) {
    throw new Error('Values and weights arrays must have the same length');
  }
  
  if (values.length === 0) return 0;
  
  const weightedSum = values.reduce((sum, value, index) => sum + value * weights[index], 0);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
};

export class RateLimiter {
  private timestamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  public async tryAcquire(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Remove old timestamps
    this.timestamps = this.timestamps.filter(ts => ts > windowStart);
    
    if (this.timestamps.length >= this.limit) {
      return false;
    }
    
    this.timestamps.push(now);
    return true;
  }

  public clear(): void {
    this.timestamps = [];
  }
} 