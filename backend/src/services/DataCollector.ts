import { IExchange } from '../exchanges/interfaces/IExchange';
import { FundingRate, OrderBook } from '../types/common';
import { supabaseClient } from '../database/supabase.client';
import { SymbolMapper } from '../utils/symbolMapper';
import { Logger } from '../utils/logger';
import { sleep } from '../utils/helpers';

export class DataCollector {
  private logger: Logger;
  private symbolMapper: SymbolMapper;
  private exchanges: Map<string, IExchange> = new Map();

  constructor() {
    this.logger = new Logger('DataCollector');
    this.symbolMapper = SymbolMapper.getInstance();
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
      try {
        const exchangeSymbol = this.symbolMapper.getExchangeSymbol(baseSymbol, exchangeName);
        if (!exchangeSymbol) continue;

        const rates = await exchange.getFundingRates(exchangeSymbol, hours);
        fundingRates.push(...rates);

        this.logger.debug(`Collected ${rates.length} funding rates from ${exchangeName} for ${baseSymbol}`);
      } catch (error) {
        this.logger.error(`Failed to collect funding rates from ${exchangeName} for ${baseSymbol}:`, error);
      }
    }

    if (fundingRates.length > 0) {
      await this.storeFundingRates(fundingRates);
    }
  }

  public async collectCurrentFundingRates(): Promise<Map<string, FundingRate[]>> {
    this.logger.info('Collecting current funding rates');

    const symbols = this.symbolMapper.getSymbolsAvailableOnMultipleExchanges();
    const currentRates = new Map<string, FundingRate[]>();

    for (const baseSymbol of symbols) {
      const rates: FundingRate[] = [];

      for (const [exchangeName, exchange] of this.exchanges) {
        try {
          const exchangeSymbol = this.symbolMapper.getExchangeSymbol(baseSymbol, exchangeName);
          if (!exchangeSymbol) continue;

          const rate = await exchange.getCurrentFundingRate(exchangeSymbol);
          rates.push(rate);
        } catch (error) {
          this.logger.error(`Failed to get current funding rate from ${exchangeName} for ${baseSymbol}:`, error);
        }
      }

      if (rates.length >= 2) { // Need at least 2 exchanges for arbitrage
        currentRates.set(baseSymbol, rates);
      }

      await sleep(100); // Brief pause between symbols
    }

    this.logger.info(`Collected current funding rates for ${currentRates.size} symbols`);
    return currentRates;
  }

  public async collectOrderBookDepth(symbol: string): Promise<Map<string, OrderBook>> {
    const orderBooks = new Map<string, OrderBook>();

    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        const exchangeSymbol = this.symbolMapper.getExchangeSymbol(symbol, exchangeName);
        if (!exchangeSymbol) continue;

        const orderBook = await exchange.getOrderBook(exchangeSymbol, 50);
        orderBooks.set(exchangeName, orderBook);

        // Store orderbook snapshot
        await this.storeOrderBookSnapshot(orderBook);
      } catch (error) {
        this.logger.error(`Failed to collect order book from ${exchangeName} for ${symbol}:`, error);
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

      const { error } = await supabaseClient
        .from('funding_rates')
        .insert(records);

      if (error) {
        throw new Error(`Failed to store funding rates: ${error.message}`);
      }

      this.logger.debug(`Stored ${records.length} funding rate records`);
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
} 