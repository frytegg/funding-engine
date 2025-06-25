import { FundingRate, OrderBook, TradeOrder, TradeResult, Position } from '../../types/common';

export interface IExchange {
  getName(): string;
  isConnected(): boolean;
  
  // Market data methods
  getFundingRates(symbol: string, hours?: number): Promise<FundingRate[]>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  getCurrentFundingRate(symbol: string): Promise<FundingRate>;
  
  // Trading methods
  executeTrade(order: TradeOrder): Promise<TradeResult>;
  getPosition(symbol: string): Promise<Position | null>;
  closePosition(symbol: string): Promise<boolean>;
  setLeverage(symbol: string, leverage: number): Promise<boolean>;
  
  // Account methods
  getBalance(): Promise<number>;
  getAccountInfo(): Promise<any>;
  
  // Utility methods
  normalizeSymbol(symbol: string): string;
  validateSymbol(symbol: string): boolean;
  
  // Connection methods
  connect(): Promise<void>;
  disconnect(): Promise<void>;
} 