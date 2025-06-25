import { v4 as uuidv4 } from 'uuid';

export function generateUUID(): string {
  return uuidv4();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateBasisPoints(value1: number, value2: number): number {
  if (value2 === 0) return 0;
  return Math.abs((value1 - value2) / value2) * 10000;
}

export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

export function roundTo(num: number, decimals: number): number {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  side: 'long' | 'short'
): number {
  const maintenanceMarginRate = 0.01; // 1% maintenance margin
  
  if (side === 'long') {
    return entryPrice * (1 - (1 / leverage) + maintenanceMarginRate);
  } else {
    return entryPrice * (1 + (1 / leverage) - maintenanceMarginRate);
  }
}

export function isValidNumber(value: any): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateOptimalOrderSize(
  availableLiquidity: number,
  maxPositionSize: number,
  capitalAllocation: number
): number {
  return Math.min(
    availableLiquidity * 0.8, // Use 80% of available liquidity
    maxPositionSize,
    capitalAllocation * 0.9 // Use 90% of allocated capital
  );
}

export function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export function parseFundingRate(rate: string | number): number {
  if (typeof rate === 'number') return rate;
  return parseFloat(rate) || 0;
}

export function calculateAnnualizedReturn(
  fundingRate: number,
  hoursPerPeriod: number = 8
): number {
  const periodsPerYear = (365 * 24) / hoursPerPeriod;
  return fundingRate * periodsPerYear;
}

export function calculateSlippage(
  intendedPrice: number,
  executedPrice: number
): number {
  if (intendedPrice === 0) return 0;
  return Math.abs((executedPrice - intendedPrice) / intendedPrice) * 100;
}

export function timeUntilNextFunding(): number {
  const now = new Date();
  const nextFunding = new Date(now);
  
  // Funding times are typically at 00:00, 08:00, 16:00 UTC
  const currentHour = now.getUTCHours();
  let nextFundingHour = 0;
  
  if (currentHour < 8) {
    nextFundingHour = 8;
  } else if (currentHour < 16) {
    nextFundingHour = 16;
  } else {
    nextFundingHour = 24; // Next day 00:00
  }
  
  nextFunding.setUTCHours(nextFundingHour, 0, 0, 0);
  
  if (nextFundingHour === 24) {
    nextFunding.setUTCDate(nextFunding.getUTCDate() + 1);
    nextFunding.setUTCHours(0, 0, 0, 0);
  }
  
  return nextFunding.getTime() - now.getTime();
} 