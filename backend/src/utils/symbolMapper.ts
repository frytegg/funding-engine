import { supabaseClient } from '../database/supabase.client';
import { ExchangeSymbols } from '../types/common';
import { Logger } from './logger';

export class SymbolMapper {
  private static instance: SymbolMapper;
  private mappings: Map<string, ExchangeSymbols> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('SymbolMapper');
  }

  public static getInstance(): SymbolMapper {
    if (!SymbolMapper.instance) {
      SymbolMapper.instance = new SymbolMapper();
    }
    return SymbolMapper.instance;
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
        this.mappings.set(mapping.base_symbol, {
          base: mapping.base_symbol,
          bybit: mapping.bybit_symbol,
          bitget: mapping.bitget_symbol,
          kucoin: mapping.kucoin_symbol,
          hyperliquid: mapping.hyperliquid_symbol,
        });
      });

      this.logger.info(`Loaded ${this.mappings.size} symbol mappings`);
    } catch (error) {
      this.logger.error('Failed to load symbol mappings:', error);
      throw error;
    }
  }

  public getExchangeSymbol(baseSymbol: string, exchange: string): string | null {
    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) {
      this.logger.warn(`No mapping found for base symbol: ${baseSymbol}`);
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
    return this.mappings.get(baseSymbol) || null;
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
      const { error } = await supabaseClient
        .from('symbol_mappings')
        .upsert({
          base_symbol: mapping.base,
          bybit_symbol: mapping.bybit,
          bitget_symbol: mapping.bitget,
          kucoin_symbol: mapping.kucoin,
          hyperliquid_symbol: mapping.hyperliquid,
          is_active: true,
        });

      if (error) {
        throw new Error(`Failed to add symbol mapping: ${error.message}`);
      }

      this.mappings.set(mapping.base, mapping);
      this.logger.info(`Added symbol mapping for ${mapping.base}`);
    } catch (error) {
      this.logger.error('Failed to add symbol mapping:', error);
      throw error;
    }
  }
} 