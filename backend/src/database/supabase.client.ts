import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { databaseConfig } from '../config/database.config';

class SupabaseClientManager {
  private static instance: SupabaseClientManager;
  private client: SupabaseClient;

  private constructor() {
    this.client = createClient(
      databaseConfig.supabaseUrl,
      databaseConfig.supabaseServiceRoleKey
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
        .select('id')
        .limit(1);
      
      return !error;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
}

export const supabaseClient = SupabaseClientManager.getInstance().getClient();
export default SupabaseClientManager; 