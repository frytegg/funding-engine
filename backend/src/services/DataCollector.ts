import { IExchange } from '../exchanges/interfaces/IExchange';
import { FundingRate, OrderBook, Trade } from '../types/common';
import { supabaseClient } from '../database/supabase.client';
import { SymbolMapper } from '../utils/symbolMapper';
import { Logger } from '../utils/logger';
import { sleep } from '../utils/helpers';
import { SupabaseClient } from '@supabase/supabase-js';

export class DataCollector {
  private logger: Logger;
  private symbolMapper: SymbolMapper;
  private exchanges: Map<string, IExchange> = new Map();
  private supabase: SupabaseClient;

  constructor() {
    this.logger = new Logger('DataCollector');
    this.symbolMapper = SymbolMapper.getInstance();
    this.supabase = supabaseClient;
  }

  public addExchange(exchange: IExchange): void {
    this.exchanges.set(exchange.getName(), exchange);
    this.logger.info(`Added exchange: ${exchange.getName()}`);
  }

  public async collectHistoricalFundingRates(hours: number = 72): Promise<void> {
    this.logger.info(`Starting historical funding rate collection for ${hours} hours`);

    const symbols = this.symbolMapper.getSymbolsAvailableOnMultipleExchanges();
    
    if (symbols.length === 0) {
      this.logger.warn('No symbols available on multiple exchanges');
      return;
    }

    for (const baseSymbol of symbols) {
      await this.collectFundingRatesForSymbol(baseSymbol, hours);
      await sleep(1000); // Rate limiting between symbols
    }

    this.logger.info('Historical funding rate collection completed');
  }

  private async collectFundingRatesForSymbol(baseSymbol: string, hours: number): Promise<void> {
    const symbolMapping = this.symbolMapper.getAllSymbolsForBase(baseSymbol);
    if (!symbolMapping) return;

    const fundingRates: FundingRate[] = [];

    for (const [exchangeName, exchange] of this.exchanges) {
      const exchangeSymbol = this.symbolMapper.getExchangeSymbol(baseSymbol, exchangeName);
      if (!exchangeSymbol) {
        this.logger.debug(`No symbol mapping for ${baseSymbol} on ${exchangeName}`);
        continue;
      }

      try {
        const rates = await exchange.getFundingRates(exchangeSymbol, hours);
        fundingRates.push(...rates);

        this.logger.debug(`Collected ${rates.length} funding rates from ${exchangeName} for ${baseSymbol}`);
      } catch (error: any) {
        // Handle specific symbol not found errors more gracefully
        if (error.name === 'BadSymbol' || error.message?.includes('does not have market symbol')) {
          this.logger.warn(`Symbol ${exchangeSymbol} not available on ${exchangeName}, skipping...`);
        } else {
          this.logger.error(`Failed to collect funding rates from ${exchangeName} for ${baseSymbol}:`, error);
        }
      }
    }

    if (fundingRates.length > 0) {
      await this.storeFundingRates(fundingRates);
    }
  }

  public async collectCurrentFundingRates(): Promise<Map<string, FundingRate[]>> {
    this.logger.info('Collecting current funding rates');

    const symbols = this.symbolMapper.getSymbolsAvailableOnMultipleExchanges();
    this.logger.info(`Processing ${symbols.length} symbols: ${symbols.join(', ')}`);
    const currentRates = new Map<string, FundingRate[]>();
    const databaseInsertionPromises: Promise<void>[] = [];

    for (const baseSymbol of symbols) {
      const rates: FundingRate[] = [];

      for (const [exchangeName, exchange] of this.exchanges) {
        const exchangeSymbol = this.symbolMapper.getExchangeSymbol(baseSymbol, exchangeName);
        if (!exchangeSymbol) {
          this.logger.debug(`No symbol mapping for ${baseSymbol} on ${exchangeName}`);
          continue;
        }

        try {
          const rate = await exchange.getCurrentFundingRate(exchangeSymbol);
          rates.push(rate);

          // Store the rate in database
          const insertPromise = Promise.resolve(
            supabaseClient
              .from('funding_rates')
              .insert({
                exchange: exchangeName,
                symbol: baseSymbol,
                funding_rate: rate.fundingRate,
                next_funding_time: rate.nextFundingTime,
                timestamp: new Date().toISOString()
              })
              .then(({ error }) => {
                if (error) {
                  this.logger.error(`Failed to store funding rate for ${baseSymbol} on ${exchangeName}:`, error);
                }
              })
          );

          databaseInsertionPromises.push(insertPromise);
        } catch (error: any) {
          // Handle specific symbol not found errors more gracefully
          if (error.name === 'BadSymbol' || error.message?.includes('does not have market symbol')) {
            this.logger.warn(`Symbol ${exchangeSymbol} not available on ${exchangeName}, skipping...`);
          } else {
            this.logger.error(`Failed to get current funding rate from ${exchangeName} for ${baseSymbol}:`, error);
          }
        }
      }

      if (rates.length >= 2) { // Need at least 2 exchanges for arbitrage
        currentRates.set(baseSymbol, rates);
      }

      await sleep(100); // Brief pause between symbols
    }

    // Wait for all database insertions to complete
    this.logger.info('Waiting for all funding rates to be stored in database...');
    await Promise.all(databaseInsertionPromises);
    this.logger.info(`Successfully stored all funding rates for ${currentRates.size} symbols`);

    return currentRates;
  }

  public async collectOrderBookDepth(symbol: string): Promise<Map<string, OrderBook>> {
    const orderBooks = new Map<string, OrderBook>();

    for (const [exchangeName, exchange] of this.exchanges) {
      const exchangeSymbol = this.symbolMapper.getExchangeSymbol(symbol, exchangeName);
      if (!exchangeSymbol) {
        this.logger.debug(`No symbol mapping for ${symbol} on ${exchangeName}`);
        continue;
      }

      try {
        const orderBook = await exchange.getOrderBook(exchangeSymbol, 50);
        orderBooks.set(exchangeName, orderBook);

        // Store orderbook snapshot
        await this.storeOrderBookSnapshot(orderBook);
      } catch (error: any) {
        // Handle specific symbol not found errors more gracefully
        if (error.name === 'BadSymbol' || error.message?.includes('does not have market symbol')) {
          this.logger.warn(`Symbol ${exchangeSymbol} not available on ${exchangeName}, skipping...`);
        } else {
          this.logger.error(`Failed to collect order book from ${exchangeName} for ${symbol}:`, error);
        }
      }
    }

    return orderBooks;
  }

  private async storeFundingRates(fundingRates: FundingRate[]): Promise<void> {
    try {
      const records = fundingRates.map(rate => ({
        exchange: rate.exchange,
        symbol: rate.symbol,
        funding_rate: rate.fundingRate,
        next_funding_time: rate.nextFundingTime.toISOString(),
        timestamp: rate.timestamp.toISOString(),
      }));

      // Use upsert to handle potential duplicates
      const { error } = await supabaseClient
        .from('funding_rates')
        .upsert(records, {
          onConflict: 'exchange,symbol,timestamp',
          ignoreDuplicates: true
        });

      if (error) {
        throw new Error(`Failed to store funding rates: ${error.message}`);
      }

      this.logger.debug(`Stored/updated ${records.length} funding rate records`);
    } catch (error) {
      this.logger.error('Failed to store funding rates:', error);
      throw error;
    }
  }

  private async storeOrderBookSnapshot(orderBook: OrderBook): Promise<void> {
    try {
      const spread = orderBook.asks[0] && orderBook.bids[0] 
        ? orderBook.asks[0][0] - orderBook.bids[0][0] 
        : 0;

      const { error } = await supabaseClient
        .from('orderbook_depth')
        .insert({
          exchange: orderBook.exchange,
          symbol: orderBook.symbol,
          bid_depth: orderBook.bids,
          ask_depth: orderBook.asks,
          spread,
          timestamp: orderBook.timestamp.toISOString(),
        });

      if (error) {
        throw new Error(`Failed to store order book: ${error.message}`);
      }
    } catch (error) {
      this.logger.error('Failed to store order book snapshot:', error);
    }
  }

  public async getHistoricalFundingRates(
    symbol: string, 
    exchange: string, 
    hours: number = 72
  ): Promise<FundingRate[]> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const { data, error } = await supabaseClient
        .from('funding_rates')
        .select('*')
        .eq('symbol', symbol)
        .eq('exchange', exchange)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch historical funding rates: ${error.message}`);
      }

      return data.map(record => ({
        exchange: record.exchange,
        symbol: record.symbol,
        fundingRate: record.funding_rate,
        timestamp: new Date(record.timestamp),
        nextFundingTime: new Date(record.next_funding_time),
      }));
    } catch (error) {
      this.logger.error('Failed to get historical funding rates:', error);
      throw error;
    }
  }

  public async calculateAverageFundingRate(
    symbol: string, 
    exchange: string, 
    hours: number = 72
  ): Promise<number> {
    const rates = await this.getHistoricalFundingRates(symbol, exchange, hours);
    
    if (rates.length === 0) return 0;

    const sum = rates.reduce((acc, rate) => acc + rate.fundingRate, 0);
    return sum / rates.length;
  }

  public async getMarginInfo() {
    try {
      // Get margin information from all exchanges
      const exchanges = await this.getActiveExchanges();
      let totalMarginUsed = 0;
      let totalMarginAvailable = 0;

      for (const exchange of exchanges) {
        const accountInfo = await exchange.getAccountInfo();
        totalMarginUsed += accountInfo.marginUsed || 0;
        totalMarginAvailable += accountInfo.marginAvailable || 0;
      }

      return {
        marginUsed: totalMarginUsed,
        marginAvailable: totalMarginAvailable,
        marginUtilization: totalMarginAvailable > 0 ? (totalMarginUsed / totalMarginAvailable) * 100 : 0
      };
    } catch (error) {
      this.logger.error('Error getting margin information:', error);
      return {
        marginUsed: 0,
        marginAvailable: 0,
        marginUtilization: 0
      };
    }
  }

  private async getActiveExchanges(): Promise<IExchange[]> {
    return Array.from(this.exchanges.values()).filter(exchange => exchange.isInitialized());
  }

  public async getDailyVolume(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: trades } = await this.supabase
      .from('trades')
      .select('volume')
      .gte('timestamp', oneDayAgo);

    if (!trades) return 0;
    return trades.reduce((sum: number, record: { volume: number }) => sum + Math.abs(record.volume || 0), 0);
  }

  public async getMonthlyVolume(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trades } = await this.supabase
      .from('trades')
      .select('volume')
      .gte('timestamp', thirtyDaysAgo);

    if (!trades) return 0;
    return trades.reduce((sum: number, record: { volume: number }) => sum + Math.abs(record.volume || 0), 0);
  }
} 