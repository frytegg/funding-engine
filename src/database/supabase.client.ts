import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { databaseConfig } from '../config/database.config';
import { logger } from '../utils/logger';

export class SupabaseClientManager {
  private static instance: SupabaseClientManager;
  private client: SupabaseClient;

  private constructor() {
    this.client = createClient(
      databaseConfig.supabaseUrl,
      databaseConfig.supabaseAnonKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );
  }

  public static getInstance(): SupabaseClientManager {
    if (!SupabaseClientManager.instance) {
      SupabaseClientManager.instance = new SupabaseClientManager();
    }
    return SupabaseClientManager.instance;
  }

  public getClient(): SupabaseClient {
    return this.client;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('funding_rates')
        .select('count')
        .limit(1);
      
      if (error) {
        logger.error('Database connection test failed:', error);
        return false;
      }
      
      logger.info('Database connection successful');
      return true;
    } catch (error) {
      logger.error('Database connection test error:', error);
      return false;
    }
  }

  public async insertFundingRate(
    exchange: string,
    symbol: string,
    fundingRate: number,
    timestamp: Date
  ): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('funding_rates')
        .insert({
          exchange,
          symbol,
          funding_rate: fundingRate,
          timestamp: timestamp.toISOString(),
        });

      if (error) {
        logger.error('Error inserting funding rate:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error inserting funding rate:', error);
      return false;
    }
  }

  public async getFundingRatesHistory(
    exchange: string,
    symbol: string,
    hoursBack: number
  ): Promise<any[]> {
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      
      const { data, error } = await this.client
        .from('funding_rates')
        .select('*')
        .eq('exchange', exchange)
        .eq('symbol', symbol)
        .gte('timestamp', cutoffTime.toISOString())
        .order('timestamp', { ascending: false });

      if (error) {
        logger.error('Error fetching funding rates history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching funding rates history:', error);
      return [];
    }
  }

  public async insertOrderbookDepth(
    exchange: string,
    symbol: string,
    bidDepth: any,
    askDepth: any,
    timestamp: Date
  ): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('orderbook_depth')
        .insert({
          exchange,
          symbol,
          bid_depth: bidDepth,
          ask_depth: askDepth,
          timestamp: timestamp.toISOString(),
        });

      if (error) {
        logger.error('Error inserting orderbook depth:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error inserting orderbook depth:', error);
      return false;
    }
  }

  public async insertTrade(tradeData: {
    strategyId: string;
    exchange: string;
    symbol: string;
    side: string;
    price: number;
    quantity: number;
    leverage: number;
    orderType: string;
    status: string;
    fees: number;
  }): Promise<string | null> {
    try {
      const { data, error } = await this.client
        .from('trades')
        .insert({
          strategy_id: tradeData.strategyId,
          exchange: tradeData.exchange,
          symbol: tradeData.symbol,
          side: tradeData.side,
          price: tradeData.price,
          quantity: tradeData.quantity,
          leverage: tradeData.leverage,
          order_type: tradeData.orderType,
          status: tradeData.status,
          fees: tradeData.fees,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Error inserting trade:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      logger.error('Error inserting trade:', error);
      return null;
    }
  }

  public async insertPosition(positionData: {
    strategyId: string;
    exchange: string;
    symbol: string;
    side: string;
    entryPrice: number;
    quantity: number;
    leverage: number;
    liquidationPrice: number;
    tpPrice?: number;
    slPrice?: number;
    status: string;
  }): Promise<string | null> {
    try {
      const { data, error } = await this.client
        .from('positions')
        .insert({
          strategy_id: positionData.strategyId,
          exchange: positionData.exchange,
          symbol: positionData.symbol,
          side: positionData.side,
          entry_price: positionData.entryPrice,
          quantity: positionData.quantity,
          leverage: positionData.leverage,
          liquidation_price: positionData.liquidationPrice,
          tp_price: positionData.tpPrice,
          sl_price: positionData.slPrice,
          status: positionData.status,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Error inserting position:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      logger.error('Error inserting position:', error);
      return null;
    }
  }

  public async updatePosition(
    positionId: string,
    updates: {
      quantity?: number;
      status?: string;
      tpPrice?: number;
      slPrice?: number;
    }
  ): Promise<boolean> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.tpPrice !== undefined) updateData.tp_price = updates.tpPrice;
      if (updates.slPrice !== undefined) updateData.sl_price = updates.slPrice;

      const { error } = await this.client
        .from('positions')
        .update(updateData)
        .eq('id', positionId);

      if (error) {
        logger.error('Error updating position:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error updating position:', error);
      return false;
    }
  }

  public async getActivePositions(): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('positions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching active positions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching active positions:', error);
      return [];
    }
  }

  public async getSymbolMapping(baseSymbol: string): Promise<any | null> {
    try {
      const { data, error } = await this.client
        .from('symbol_mappings')
        .select('*')
        .eq('base_symbol', baseSymbol)
        .single();

      if (error) {
        logger.error('Error fetching symbol mapping:', error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Error fetching symbol mapping:', error);
      return null;
    }
  }

  public async insertSymbolMapping(mappingData: {
    baseSymbol: string;
    bybitSymbol: string;
    bitgetSymbol: string;
    kucoinSymbol: string;
    hyperliquidSymbol: string;
  }): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('symbol_mappings')
        .upsert({
          base_symbol: mappingData.baseSymbol,
          bybit_symbol: mappingData.bybitSymbol,
          bitget_symbol: mappingData.bitgetSymbol,
          kucoin_symbol: mappingData.kucoinSymbol,
          hyperliquid_symbol: mappingData.hyperliquidSymbol,
        });

      if (error) {
        logger.error('Error inserting symbol mapping:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error inserting symbol mapping:', error);
      return false;
    }
  }
} 