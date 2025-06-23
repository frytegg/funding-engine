import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Get completed strategy performances (trades)
    const { data: trades, error } = await supabase
      .from('strategy_performance')
      .select('*')
      .not('exit_time', 'is', null)
      .order('exit_time', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Transform data to match frontend expectations
    const transformedData = trades?.map(trade => ({
      id: trade.id,
      symbol: trade.base_symbol,
      longExchange: trade.long_exchange,
      shortExchange: trade.short_exchange,
      entrySpread: trade.expected_profit_bps / 100, // Convert bps to percentage
      exitSpread: 0, // This information might not be directly available
      pnl: trade.realized_profit_usd || 0,
      timestamp: trade.exit_time,
    })) || [];

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
} 