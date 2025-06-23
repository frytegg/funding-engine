import { logger } from '../utils/logger';
import { SupabaseClientManager } from '../database/supabase.client';

interface ExchangeSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  active: boolean;
  type: 'spot' | 'futures' | 'perpetual';
}

interface SymbolMapping {
  standardSymbol: string;
  bybit?: string;
  bitget?: string;
  kucoin?: string;
  hyperliquid?: string;
  exchangeCount: number;
}

export class SymbolMappingService {
  private symbolMappings: Map<string, SymbolMapping> = new Map();
  private supabaseClient = SupabaseClientManager.getInstance().getClient();
  
  constructor() {}

  /**
   * Fetch all symbols from Bybit
   */
  private async fetchBybitSymbols(): Promise<ExchangeSymbol[]> {
    try {
      const response = await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear');
      const data = await response.json() as any;
      
      if (!data.result?.list) {
        throw new Error('Invalid Bybit symbols response');
      }

      return data.result.list
        .filter((symbol: any) => symbol.quoteCoin === 'USDT' && symbol.status === 'Trading')
        .map((symbol: any) => ({
          symbol: symbol.symbol,
          baseAsset: symbol.baseCoin,
          quoteAsset: symbol.quoteCoin,
          active: symbol.status === 'Trading',
          type: 'perpetual' as const
        }));
    } catch (error) {
      logger.error('Failed to fetch Bybit symbols:', error);
      return [];
    }
  }

  /**
   * Fetch all symbols from Bitget
   */
  private async fetchBitgetSymbols(): Promise<ExchangeSymbol[]> {
    try {
      const response = await fetch('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES');
      const data = await response.json() as any;
      
      if (!data.data) {
        throw new Error('Invalid Bitget symbols response');
      }

          return data.data
      .filter((symbol: any) => symbol.quoteCoin === 'USDT' && symbol.symbolStatus === 'normal')
      .map((symbol: any) => ({
        symbol: symbol.symbol,
        baseAsset: symbol.baseCoin,
        quoteAsset: symbol.quoteCoin,
        active: symbol.symbolStatus === 'normal',
        type: 'perpetual' as const
      }));
    } catch (error) {
      logger.error('Failed to fetch Bitget symbols:', error);
      return [];
    }
  }

  /**
   * Fetch all symbols from KuCoin
   */
  private async fetchKucoinSymbols(): Promise<ExchangeSymbol[]> {
    try {
      const response = await fetch('https://api-futures.kucoin.com/api/v1/contracts/active');
      const data = await response.json() as any;
      
      if (!data.data) {
        throw new Error('Invalid KuCoin symbols response');
      }

      return data.data
        .filter((symbol: any) => symbol.quoteCurrency === 'USDT' && symbol.status === 'Open')
        .map((symbol: any) => ({
          symbol: symbol.symbol,
          baseAsset: symbol.baseCurrency,
          quoteAsset: symbol.quoteCurrency,
          active: symbol.status === 'Open',
          type: 'perpetual' as const
        }));
    } catch (error) {
      logger.error('Failed to fetch KuCoin symbols:', error);
      return [];
    }
  }

  /**
   * Fetch all symbols from Hyperliquid
   */
  private async fetchHyperliquidSymbols(): Promise<ExchangeSymbol[]> {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' })
      });
      const data = await response.json() as any;
      
      if (!data.universe) {
        throw new Error('Invalid Hyperliquid symbols response');
      }

      return data.universe
        .filter((symbol: any) => symbol.name && !symbol.name.includes('/'))
        .map((symbol: any) => ({
          symbol: symbol.name,
          baseAsset: symbol.name,
          quoteAsset: 'USD', // Hyperliquid uses USD as quote
          active: true,
          type: 'perpetual' as const
        }));
    } catch (error) {
      logger.error('Failed to fetch Hyperliquid symbols:', error);
      return [];
    }
  }

  /**
   * Normalize symbol to standard format (BASE/USDT)
   */
  private normalizeSymbol(baseAsset: string, quoteAsset: string): string {
    // Handle special cases
    const baseNormalized = baseAsset.toUpperCase()
      .replace('XBT', 'BTC') // KuCoin uses XBT for Bitcoin
      .replace('1000', '') // Remove 1000 prefix from some tokens
      .replace(/\d+$/, ''); // Remove trailing numbers
    
    // For Hyperliquid USD pairs, convert to USDT equivalent
    const quoteNormalized = quoteAsset === 'USD' ? 'USDT' : quoteAsset;
    
    return `${baseNormalized}/${quoteNormalized}`;
  }

  /**
   * Build comprehensive symbol mappings
   */
  public async buildSymbolMappings(): Promise<void> {
    logger.info('Starting comprehensive symbol mapping...');
    
    try {
      // Fetch symbols from all exchanges in parallel
      const [bybitSymbols, bitgetSymbols, kucoinSymbols, hyperliquidSymbols] = await Promise.all([
        this.fetchBybitSymbols(),
        this.fetchBitgetSymbols(),
        this.fetchKucoinSymbols(),
        this.fetchHyperliquidSymbols()
      ]);

      logger.info(`Fetched symbols: Bybit(${bybitSymbols.length}), Bitget(${bitgetSymbols.length}), KuCoin(${kucoinSymbols.length}), Hyperliquid(${hyperliquidSymbols.length})`);

      const mappings = new Map<string, SymbolMapping>();

      // Process Bybit symbols
      for (const symbol of bybitSymbols) {
        const standardSymbol = this.normalizeSymbol(symbol.baseAsset, symbol.quoteAsset);
        if (!mappings.has(standardSymbol)) {
          mappings.set(standardSymbol, {
            standardSymbol,
            exchangeCount: 0
          });
        }
        const mapping = mappings.get(standardSymbol)!;
        mapping.bybit = symbol.symbol;
        mapping.exchangeCount++;
      }

      // Process Bitget symbols
      for (const symbol of bitgetSymbols) {
        const standardSymbol = this.normalizeSymbol(symbol.baseAsset, symbol.quoteAsset);
        if (!mappings.has(standardSymbol)) {
          mappings.set(standardSymbol, {
            standardSymbol,
            exchangeCount: 0
          });
        }
        const mapping = mappings.get(standardSymbol)!;
        mapping.bitget = symbol.symbol;
        mapping.exchangeCount++;
      }

      // Process KuCoin symbols
      for (const symbol of kucoinSymbols) {
        const standardSymbol = this.normalizeSymbol(symbol.baseAsset, symbol.quoteAsset);
        if (!mappings.has(standardSymbol)) {
          mappings.set(standardSymbol, {
            standardSymbol,
            exchangeCount: 0
          });
        }
        const mapping = mappings.get(standardSymbol)!;
        mapping.kucoin = symbol.symbol;
        mapping.exchangeCount++;
      }

      // Process Hyperliquid symbols
      for (const symbol of hyperliquidSymbols) {
        const standardSymbol = this.normalizeSymbol(symbol.baseAsset, symbol.quoteAsset);
        if (!mappings.has(standardSymbol)) {
          mappings.set(standardSymbol, {
            standardSymbol,
            exchangeCount: 0
          });
        }
        const mapping = mappings.get(standardSymbol)!;
        mapping.hyperliquid = symbol.symbol;
        mapping.exchangeCount++;
      }

      // Filter symbols present in at least 2 exchanges
      const validMappings = Array.from(mappings.values())
        .filter(mapping => mapping.exchangeCount >= 2);

      this.symbolMappings = new Map(validMappings.map(m => [m.standardSymbol, m]));

      logger.info(`Built ${validMappings.length} symbol mappings for symbols present in 2+ exchanges`);

      // Save to database
      await this.saveMappingsToDatabase(validMappings);

    } catch (error) {
      logger.error('Failed to build symbol mappings:', error);
      throw error;
    }
  }

  /**
   * Save mappings to database
   */
  private async saveMappingsToDatabase(mappings: SymbolMapping[]): Promise<void> {
    try {
      // Clear existing mappings
      await this.supabaseClient.from('symbol_mappings').delete().neq('id', 0);

      // Insert new mappings
      const dbMappings = mappings.map(mapping => ({
        standard_symbol: mapping.standardSymbol,
        bybit_symbol: mapping.bybit || null,
        bitget_symbol: mapping.bitget || null,
        kucoin_symbol: mapping.kucoin || null,
        hyperliquid_symbol: mapping.hyperliquid || null,
        exchange_count: mapping.exchangeCount,
        is_active: true
      }));

      const { error } = await this.supabaseClient
        .from('symbol_mappings')
        .insert(dbMappings);

      if (error) {
        throw error;
      }

      logger.info(`Saved ${mappings.length} symbol mappings to database`);
    } catch (error) {
      logger.error('Failed to save mappings to database:', error);
      throw error;
    }
  }

  /**
   * Load mappings from database
   */
  public async loadMappingsFromDatabase(): Promise<void> {
    try {
      const { data, error } = await this.supabaseClient
        .from('symbol_mappings')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        logger.warn('No symbol mappings found in database. Building new mappings...');
        await this.buildSymbolMappings();
        return;
      }

      // Convert database format to internal format
      const mappings = data.map((row: any) => ({
        standardSymbol: row.standard_symbol,
        bybit: row.bybit_symbol || undefined,
        bitget: row.bitget_symbol || undefined,
        kucoin: row.kucoin_symbol || undefined,
        hyperliquid: row.hyperliquid_symbol || undefined,
        exchangeCount: row.exchange_count
      }));

      this.symbolMappings = new Map(mappings.map((m: any) => [m.standardSymbol, m]));
      logger.info(`Loaded ${mappings.length} symbol mappings from database`);

    } catch (error) {
      logger.error('Failed to load mappings from database:', error);
      throw error;
    }
  }

  /**
   * Get symbol for specific exchange
   */
  public getExchangeSymbol(standardSymbol: string, exchange: string): string | undefined {
    const mapping = this.symbolMappings.get(standardSymbol);
    if (!mapping) return undefined;

    switch (exchange.toLowerCase()) {
      case 'bybit':
        return mapping.bybit;
      case 'bitget':
        return mapping.bitget;
      case 'kucoin':
        return mapping.kucoin;
      case 'hyperliquid':
        return mapping.hyperliquid;
      default:
        return undefined;
    }
  }

  /**
   * Get all available standard symbols
   */
  public getAvailableSymbols(): string[] {
    return Array.from(this.symbolMappings.keys());
  }

  /**
   * Get symbols available on specific exchanges
   */
  public getSymbolsForExchanges(exchanges: string[]): string[] {
    return Array.from(this.symbolMappings.values())
      .filter(mapping => {
        return exchanges.every(exchange => {
          const symbol = this.getExchangeSymbol(mapping.standardSymbol, exchange);
          return symbol !== undefined;
        });
      })
      .map(mapping => mapping.standardSymbol);
  }

  /**
   * Get mapping details for a symbol
   */
  public getSymbolMapping(standardSymbol: string): SymbolMapping | undefined {
    return this.symbolMappings.get(standardSymbol);
  }

  /**
   * Update mappings (should be run periodically)
   */
  public async updateMappings(): Promise<void> {
    logger.info('Updating symbol mappings...');
    await this.buildSymbolMappings();
  }

  /**
   * Get statistics about current mappings
   */
  public getMappingStats(): {
    totalSymbols: number;
    byExchange: Record<string, number>;
    byExchangeCount: Record<number, number>;
  } {
    const stats = {
      totalSymbols: this.symbolMappings.size,
      byExchange: {
        bybit: 0,
        bitget: 0,
        kucoin: 0,
        hyperliquid: 0
      },
      byExchangeCount: {} as Record<number, number>
    };

    for (const mapping of this.symbolMappings.values()) {
      if (mapping.bybit) stats.byExchange.bybit++;
      if (mapping.bitget) stats.byExchange.bitget++;
      if (mapping.kucoin) stats.byExchange.kucoin++;
      if (mapping.hyperliquid) stats.byExchange.hyperliquid++;
      
      stats.byExchangeCount[mapping.exchangeCount] = 
        (stats.byExchangeCount[mapping.exchangeCount] || 0) + 1;
    }

    return stats;
  }
} 