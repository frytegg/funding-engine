import { supabaseClient } from '../database/supabase.client';
import { ExchangeSymbols } from '../types/common';
import { Logger } from './logger';

export class SymbolMapper {
  private static instance: SymbolMapper;
  private mappings: Map<string, ExchangeSymbols> = new Map();
  private logger: Logger;
  private lastLoadTime: Date | null = null;

  private constructor() {
    this.logger = new Logger('SymbolMapper');
  }

  private cleanSymbol(symbol: string): string {
    // Remove trailing slash if present
    return symbol.replace(/\/$/, '');
  }

  public static getInstance(): SymbolMapper {
    if (!SymbolMapper.instance) {
      SymbolMapper.instance = new SymbolMapper();
    }
    return SymbolMapper.instance;
  }

  public async reloadMappings(): Promise<void> {
    this.logger.info('🔄 Reloading symbol mappings...');
    await this.loadMappings();
    this.lastLoadTime = new Date();
    this.logger.info('✅ Symbol mappings reloaded successfully');
  }

  public getLastLoadTime(): Date | null {
    return this.lastLoadTime;
  }

  public async loadMappings(): Promise<void> {
    try {
      const { data, error } = await supabaseClient
        .from('symbol_mappings')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw new Error(`Failed to load symbol mappings: ${error.message}`);
      }

      this.mappings.clear();
      data?.forEach(mapping => {
        const cleanBaseSymbol = this.cleanSymbol(mapping.base_symbol);
        this.mappings.set(cleanBaseSymbol, {
          base: cleanBaseSymbol,
          bybit: mapping.bybit_symbol,
          bitget: mapping.bitget_symbol,
          kucoin: mapping.kucoin_symbol,
          hyperliquid: mapping.hyperliquid_symbol,
        });
      });

      this.lastLoadTime = new Date();
      this.logger.info(`✅ Loaded ${this.mappings.size} symbol mappings`);
    } catch (error) {
      this.logger.error('❌ Failed to load symbol mappings:', error);
      throw error;
    }
  }

  public getExchangeSymbol(baseSymbol: string, exchange: string): string | null {
    const cleanBaseSymbol = this.cleanSymbol(baseSymbol);
    const mapping = this.mappings.get(cleanBaseSymbol);
    if (!mapping) {
      this.logger.warn(`No mapping found for base symbol: ${cleanBaseSymbol}`);
      return null;
    }

    switch (exchange.toLowerCase()) {
      case 'bybit':
        return mapping.bybit || null;
      case 'bitget':
        return mapping.bitget || null;
      case 'kucoin':
        return mapping.kucoin || null;
      case 'hyperliquid':
        return mapping.hyperliquid || null;
      default:
        this.logger.warn(`Unknown exchange: ${exchange}`);
        return null;
    }
  }

  public getAllSymbolsForBase(baseSymbol: string): ExchangeSymbols | null {
    const cleanBaseSymbol = this.cleanSymbol(baseSymbol);
    return this.mappings.get(cleanBaseSymbol) || null;
  }

  public getAvailableBaseSymbols(): string[] {
    return Array.from(this.mappings.keys());
  }

  public getSymbolsAvailableOnMultipleExchanges(): string[] {
    return this.getAvailableBaseSymbols().filter(baseSymbol => {
      const mapping = this.mappings.get(baseSymbol);
      if (!mapping) return false;

      const availableExchanges = [
        mapping.bybit,
        mapping.bitget,
        mapping.kucoin,
        mapping.hyperliquid
      ].filter(symbol => !!symbol);

      return availableExchanges.length >= 2;
    });
  }

  public async addSymbolMapping(mapping: ExchangeSymbols): Promise<void> {
    try {
      const cleanBaseSymbol = this.cleanSymbol(mapping.base);
      const { error } = await supabaseClient
        .from('symbol_mappings')
        .upsert({
          base_symbol: cleanBaseSymbol,
          bybit_symbol: mapping.bybit,
          bitget_symbol: mapping.bitget,
          kucoin_symbol: mapping.kucoin,
          hyperliquid_symbol: mapping.hyperliquid,
          is_active: true,
        });

      if (error) {
        throw new Error(`Failed to add symbol mapping: ${error.message}`);
      }

      this.mappings.set(cleanBaseSymbol, {
        ...mapping,
        base: cleanBaseSymbol
      });
      this.logger.info(`Added symbol mapping for ${cleanBaseSymbol}`);
    } catch (error) {
      this.logger.error('Failed to add symbol mapping:', error);
      throw error;
    }
  }
} 