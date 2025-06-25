declare const process: NodeJS.Process;

export interface DatabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

export const databaseConfig: DatabaseConfig = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

if (!databaseConfig.supabaseUrl || !databaseConfig.supabaseServiceRoleKey) {
  throw new Error('Missing required Supabase configuration');
} 