import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: opportunities, error } = await supabase
      .from('strategy_performance')
      .select('*')
      .eq('status', 'active')
      .order('entry_time', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Transform data to match frontend expectations
    const transformedData = opportunities?.map(opp => ({
      id: opp.id,
      longExchange: opp.long_exchange,
      shortExchange: opp.short_exchange,
      symbol: opp.base_symbol,
      spread: opp.expected_profit_bps / 100, // Convert bps to percentage
      yield: opp.expected_profit_bps / 10000, // Convert bps to decimal
      estimatedPnl: opp.realized_profit_usd || 0,
      timestamp: opp.entry_time,
    })) || [];

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching arbitrage opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch arbitrage opportunities' }, { status: 500 });
  }
} 