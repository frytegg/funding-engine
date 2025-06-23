import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: positions, error } = await supabase
      .from('positions')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform data to match frontend expectations
    const transformedData = positions?.map(pos => ({
      id: pos.id,
      symbol: pos.symbol,
      longPosition: pos.side === 'long' ? {
        exchange: pos.exchange,
        size: pos.quantity,
        entryPrice: pos.entry_price
      } : null,
      shortPosition: pos.side === 'short' ? {
        exchange: pos.exchange,
        size: pos.quantity,
        entryPrice: pos.entry_price
      } : null,
      status: pos.status,
      // You might want to calculate current PnL from your risk_metrics table
      currentPnl: 0 // This should be calculated or fetched from risk_metrics
    })) || [];

    // Group positions by symbol to combine long and short
    const groupedPositions = transformedData.reduce((acc: any[], pos) => {
      const existingPos = acc.find(p => p.symbol === pos.symbol);
      if (existingPos) {
        if (pos.longPosition) existingPos.longPosition = pos.longPosition;
        if (pos.shortPosition) existingPos.shortPosition = pos.shortPosition;
      } else {
        acc.push(pos);
      }
      return acc;
    }, []);

    return NextResponse.json(groupedPositions);
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
} 