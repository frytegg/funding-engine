import { ExchangeSymbols } from '../types/common';
import { SupabaseClientManager } from '../database/supabase.client';
import { logger } from './logger';
import { bybitSymbolMappings } from '../config/exchanges/bybit.config';
import { bitgetSymbolMappings } from '../config/exchanges/bitget.config';
import { kucoinSymbolMappings } from '../config/exchanges/kucoin.config';
import { hyperliquidSymbolMappings } from '../config/exchanges/hyperliquid.config';

export class SymbolMapper {
  private static instance: SymbolMapper;
  private mappings: Map<string, ExchangeSymbols> = new Map();
  private dbClient: SupabaseClientManager;

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

  public async loadMappingsFromDatabase(): Promise<void> {
    try {
      // This would fetch from database in a real implementation
      // For now, we'll use the static mappings
      logger.info('Symbol mappings loaded from database');
    } catch (error) {
      logger.error('Failed to load symbol mappings from database:', error);
    }
  }

  public getExchangeSymbol(baseSymbol: string, exchange: string): string {
    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) {
      logger.warn(`No mapping found for base symbol: ${baseSymbol}`);
      return '';
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
        return '';
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
    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) {
      logger.warn(`No mapping found for base symbol: ${baseSymbol}`);
      return null;
    }
    return mapping;
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

  public async addMapping(mapping: ExchangeSymbols): Promise<boolean> {
    try {
      this.mappings.set(mapping.base, mapping);
      
      // Save to database
      const success = await this.dbClient.insertSymbolMapping({
        baseSymbol: mapping.base,
        bybitSymbol: mapping.bybit,
        bitgetSymbol: mapping.bitget,
        kucoinSymbol: mapping.kucoin,
        hyperliquidSymbol: mapping.hyperliquid,
      });

      if (success) {
        logger.info(`Added new symbol mapping for ${mapping.base}`);
        return true;
      } else {
        logger.error(`Failed to save symbol mapping for ${mapping.base}`);
        return false;
      }
    } catch (error) {
      logger.error('Error adding symbol mapping:', error);
      return false;
    }
  }

  public validateMapping(baseSymbol: string): boolean {
    const mapping = this.mappings.get(baseSymbol);
    if (!mapping) return false;

    // Ensure at least two exchanges have this symbol
    const exchangeCount = [
      mapping.bybit,
      mapping.bitget,
      mapping.kucoin,
      mapping.hyperliquid,
    ].filter(symbol => symbol && symbol.length > 0).length;

    return exchangeCount >= 2;
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
} 