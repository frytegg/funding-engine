import { FundingRate, OrderBook, TradeOrder, TradeResult, Position } from '../../types/common';

export interface IExchange {
  /**
   * Get the name of the exchange
   */
  getName(): string;

  /**
   * Initialize the exchange connection and authenticate
   */
  initialize(): Promise<void>;

  /**
   * Get historical funding rates for a symbol
   * @param symbol Trading symbol
   * @param hours Number of hours to look back
   */
  getFundingRates(symbol: string, hours: number): Promise<FundingRate[]>;

  /**
   * Get current funding rate for a symbol
   * @param symbol Trading symbol
   */
  getCurrentFundingRate(symbol: string): Promise<FundingRate>;

  /**
   * Get order book depth for a symbol
   * @param symbol Trading symbol
   * @param depth Number of levels to fetch
   */
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;

  /**
   * Execute a trade order
   * @param order Trade order details
   */
  executeTrade(order: TradeOrder): Promise<TradeResult>;

  /**
   * Get current position for a symbol
   * @param symbol Trading symbol
   */
  getPosition(symbol: string): Promise<Position | null>;

  /**
   * Get all open positions
   */
  getAllPositions(): Promise<Position[]>;

  /**
   * Close a position for a symbol
   * @param symbol Trading symbol
   * @param quantity Optional quantity to close (default: all)
   */
  closePosition(symbol: string, quantity?: number): Promise<boolean>;

  /**
   * Set leverage for a symbol
   * @param symbol Trading symbol
   * @param leverage Leverage multiplier
   */
  setLeverage(symbol: string, leverage: number): Promise<boolean>;

  /**
   * Get account balance information
   */
  getBalance(): Promise<{
    totalBalance: number;
    availableBalance: number;
    marginUsed: number;
    unrealizedPnl: number;
  }>;

  /**
   * Get margin ratio for account
   */
  getMarginRatio(): Promise<number>;

  /**
   * Check if symbol is tradable on this exchange
   * @param symbol Trading symbol
   */
  isSymbolSupported(symbol: string): Promise<boolean>;

  /**
   * Get minimum order size for a symbol
   * @param symbol Trading symbol
   */
  getMinOrderSize(symbol: string): Promise<number>;

  /**
   * Get tick size (minimum price increment) for a symbol
   * @param symbol Trading symbol
   */
  getTickSize(symbol: string): Promise<number>;

  /**
   * Cancel all open orders for a symbol
   * @param symbol Trading symbol
   */
  cancelAllOrders(symbol: string): Promise<boolean>;

  /**
   * Get trading fees for a symbol
   * @param symbol Trading symbol
   */
  getTradingFees(symbol: string): Promise<{
    makerFee: number;
    takerFee: number;
  }>;

  /**
   * Enable or disable isolated margin mode
   * @param symbol Trading symbol
   * @param isolated True for isolated, false for cross margin
   */
  setMarginMode(symbol: string, isolated: boolean): Promise<boolean>;

  /**
   * Disconnect from the exchange
   */
  disconnect(): Promise<void>;
} 