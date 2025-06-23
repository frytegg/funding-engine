import { ExchangeSymbols } from '../types/common';
import { SupabaseClientManager } from '../database/supabase.client';
import { logger, logError } from './logger';
import { bybitSymbolMappings } from '../config/exchanges/bybit.config';
import { bitgetSymbolMappings } from '../config/exchanges/bitget.config';
import { kucoinSymbolMappings } from '../config/exchanges/kucoin.config';
import { hyperliquidSymbolMappings } from '../config/exchanges/hyperliquid.config';

export class SymbolMapper {
  private static instance: SymbolMapper;
  private mappings: Map<string, ExchangeSymbols> = new Map();
  private dbClient: SupabaseClientManager;
  private initialized = false;

  private constructor() {
    this.dbClient = SupabaseClientManager.getInstance();
    this.initializeStaticMappings();
  }

  public static getInstance(): SymbolMapper {
    if (!SymbolMapper.instance) {
      SymbolMapper.instance = new SymbolMapper();
    }
    return SymbolMapper.instance;
  }

  private initializeStaticMappings(): void {
    // Initialize with static mappings from config files
    const baseSymbols = Object.keys(bybitSymbolMappings);
    
    baseSymbols.forEach(baseSymbol => {
      const mapping: ExchangeSymbols = {
        base: baseSymbol,
        bybit: bybitSymbolMappings[baseSymbol] || '',
        bitget: bitgetSymbolMappings[baseSymbol] || '',
        kucoin: kucoinSymbolMappings[baseSymbol] || '',
        hyperliquid: hyperliquidSymbolMappings[baseSymbol] || '',
      };
      
      this.mappings.set(baseSymbol, mapping);
    });

    logger.info(`Initialized ${this.mappings.size} symbol mappings`);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadMappings();
      this.initialized = true;
      logger.info('SymbolMapper initialized successfully');
    } catch (error) {
      logError(error as Error, { context: 'SymbolMapper.initialize' });
      throw error;
    }
  }

  public async loadMappings(): Promise<void> {
    try {
      const { data, error } = await this.dbClient.getClient()
        .from('symbol_mappings')
        .select('*');

      if (error) {
        throw new Error(`Failed to load symbol mappings: ${error.message}`);
      }

      if (!data) {
        logger.warn('No symbol mappings found in database');
        return;
      }

      // Clear existing mappings
      this.mappings.clear();

      // Load mappings from database
      data.forEach(mapping => {
        const symbols: ExchangeSymbols = {
          base: mapping.base_symbol,
          bybit: mapping.bybit_symbol,
          bitget: mapping.bitget_symbol,
          kucoin: mapping.kucoin_symbol,
          hyperliquid: mapping.hyperliquid_symbol,
        };

        this.mappings.set(mapping.base_symbol, symbols);
      });

      logger.info(`Loaded ${this.mappings.size} symbol mappings`);
    } catch (error) {
      logError(error as Error, { context: 'loadMappings' });
      throw error;
    }
  }

  public getExchangeSymbol(baseSymbol: string, exchange: string): string | null {
    if (!this.initialized) {
      logger.warn('SymbolMapper not initialized, call initialize() first');
      return null;
    }

    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) {
      logger.warn(`No mapping found for base symbol: ${baseSymbol}`);
      return null;
    }

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
        logger.warn(`Unknown exchange: ${exchange}`);
        return null;
    }
  }

  public getBaseSymbol(exchangeSymbol: string, exchange: string): string {
    for (const [baseSymbol, mapping] of this.mappings.entries()) {
      switch (exchange.toLowerCase()) {
        case 'bybit':
          if (mapping.bybit === exchangeSymbol) return baseSymbol;
          break;
        case 'bitget':
          if (mapping.bitget === exchangeSymbol) return baseSymbol;
          break;
        case 'kucoin':
          if (mapping.kucoin === exchangeSymbol) return baseSymbol;
          break;
        case 'hyperliquid':
          if (mapping.hyperliquid === exchangeSymbol) return baseSymbol;
          break;
      }
    }
    
    logger.warn(`No base symbol found for ${exchangeSymbol} on ${exchange}`);
    return '';
  }

  public getAllSymbolsForBase(baseSymbol: string): ExchangeSymbols | null {
    if (!this.initialized) {
      logger.warn('SymbolMapper not initialized, call initialize() first');
      return null;
    }

    const mapping = this.mappings.get(baseSymbol);
    return mapping || null;
  }

  public getSupportedBaseSymbols(): string[] {
    return Array.from(this.mappings.keys());
  }

  public isSymbolSupported(baseSymbol: string, exchange?: string): boolean {
    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) return false;

    if (!exchange) {
      // Check if symbol is supported on at least one exchange
      return !!(mapping.bybit || mapping.bitget || mapping.kucoin || mapping.hyperliquid);
    }

    // Check if symbol is supported on specific exchange
    switch (exchange.toLowerCase()) {
      case 'bybit':
        return !!mapping.bybit;
      case 'bitget':
        return !!mapping.bitget;
      case 'kucoin':
        return !!mapping.kucoin;
      case 'hyperliquid':
        return !!mapping.hyperliquid;
      default:
        return false;
    }
  }

  public async addMapping(
    baseSymbol: string,
    bybitSymbol: string,
    bitgetSymbol: string,
    kucoinSymbol: string,
    hyperliquidSymbol: string
  ): Promise<boolean> {
    try {
      const { data, error } = await this.dbClient.getClient()
        .from('symbol_mappings')
        .insert({
          base_symbol: baseSymbol,
          bybit_symbol: bybitSymbol,
          bitget_symbol: bitgetSymbol,
          kucoin_symbol: kucoinSymbol,
          hyperliquid_symbol: hyperliquidSymbol,
        });

      if (error) {
        throw new Error(`Failed to add symbol mapping: ${error.message}`);
      }

      // Update local cache
      this.mappings.set(baseSymbol, {
        base: baseSymbol,
        bybit: bybitSymbol,
        bitget: bitgetSymbol,
        kucoin: kucoinSymbol,
        hyperliquid: hyperliquidSymbol,
      });

      logger.info(`Added symbol mapping for ${baseSymbol}`);
      return true;
    } catch (error) {
      logError(error as Error, { context: 'addMapping', baseSymbol });
      return false;
    }
  }

  public async updateMapping(
    baseSymbol: string,
    updates: Partial<Omit<ExchangeSymbols, 'base'>>
  ): Promise<boolean> {
    try {
      const updateData: any = {};
      
      if (updates.bybit) updateData.bybit_symbol = updates.bybit;
      if (updates.bitget) updateData.bitget_symbol = updates.bitget;
      if (updates.kucoin) updateData.kucoin_symbol = updates.kucoin;
      if (updates.hyperliquid) updateData.hyperliquid_symbol = updates.hyperliquid;

      const { data, error } = await this.dbClient.getClient()
        .from('symbol_mappings')
        .update(updateData)
        .eq('base_symbol', baseSymbol);

      if (error) {
        throw new Error(`Failed to update symbol mapping: ${error.message}`);
      }

      // Update local cache
      const existing = this.mappings.get(baseSymbol);
      if (existing) {
        this.mappings.set(baseSymbol, {
          ...existing,
          ...updates,
        });
      }

      logger.info(`Updated symbol mapping for ${baseSymbol}`);
      return true;
    } catch (error) {
      logError(error as Error, { context: 'updateMapping', baseSymbol });
      return false;
    }
  }

  public async removeMapping(baseSymbol: string): Promise<boolean> {
    try {
      const { data, error } = await this.dbClient.getClient()
        .from('symbol_mappings')
        .delete()
        .eq('base_symbol', baseSymbol);

      if (error) {
        throw new Error(`Failed to remove symbol mapping: ${error.message}`);
      }

      // Remove from local cache
      this.mappings.delete(baseSymbol);

      logger.info(`Removed symbol mapping for ${baseSymbol}`);
      return true;
    } catch (error) {
      logError(error as Error, { context: 'removeMapping', baseSymbol });
      return false;
    }
  }

  public validateMapping(baseSymbol: string): {
    isValid: boolean;
    missingExchanges: string[];
  } {
    const mapping = this.mappings.get(baseSymbol);
    
    if (!mapping) {
      return {
        isValid: false,
        missingExchanges: ['bybit', 'bitget', 'kucoin', 'hyperliquid'],
      };
    }

    const missingExchanges: string[] = [];
    if (!mapping.bybit) missingExchanges.push('bybit');
    if (!mapping.bitget) missingExchanges.push('bitget');
    if (!mapping.kucoin) missingExchanges.push('kucoin');
    if (!mapping.hyperliquid) missingExchanges.push('hyperliquid');

    return {
      isValid: missingExchanges.length === 0,
      missingExchanges,
    };
  }

  public getExchangesForSymbol(baseSymbol: string): string[] {
    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) return [];

    const exchanges: string[] = [];
    if (mapping.bybit) exchanges.push('bybit');
    if (mapping.bitget) exchanges.push('bitget');
    if (mapping.kucoin) exchanges.push('kucoin');
    if (mapping.hyperliquid) exchanges.push('hyperliquid');

    return exchanges;
  }

  public getInverseMapping(exchangeSymbol: string, exchange: string): string | null {
    for (const [baseSymbol, mapping] of this.mappings.entries()) {
      switch (exchange.toLowerCase()) {
        case 'bybit':
          if (mapping.bybit === exchangeSymbol) return baseSymbol;
          break;
        case 'bitget':
          if (mapping.bitget === exchangeSymbol) return baseSymbol;
          break;
        case 'kucoin':
          if (mapping.kucoin === exchangeSymbol) return baseSymbol;
          break;
        case 'hyperliquid':
          if (mapping.hyperliquid === exchangeSymbol) return baseSymbol;
          break;
      }
    }
    return null;
  }

  public async refresh(): Promise<void> {
    await this.loadMappings();
  }

  public getStats(): {
    totalMappings: number;
    completeeMappings: number;
    incompleteMappings: number;
  } {
    let completeMappings = 0;
    let incompleteMappings = 0;

    for (const [baseSymbol, mapping] of this.mappings.entries()) {
      const validation = this.validateMapping(baseSymbol);
      if (validation.isValid) {
        completeMappings++;
      } else {
        incompleteMappings++;
      }
    }

    return {
      totalMappings: this.mappings.size,
      completeeMappings: completeMappings,
      incompleteMappings,
    };
  }
}

// Export function to get singleton instance
export const getSymbolMapper = (): SymbolMapper => {
  return SymbolMapper.getInstance();
};

// Legacy function for backward compatibility
export const getExchangeSymbol = (exchangeName: string, baseSymbol: string): string => {
  const mapper = getSymbolMapper();
  return mapper.getExchangeSymbol(baseSymbol, exchangeName) || baseSymbol;
}; 