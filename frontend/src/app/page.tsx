'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons";

interface ArbitrageOpportunity {
  id: number;
  longExchange: string;
  shortExchange: string;
  symbol: string;
  spread: number;
  yield: number;
  estimatedPnl: number;
  slippage: number;
  timestamp: string;
}

interface Position {
  id: number;
  symbol: string;
  longPosition: {
    exchange: string;
    size: number;
    entryPrice: number;
  };
  shortPosition: {
    exchange: string;
    size: number;
    entryPrice: number;
  };
  currentPnl: number;
  status: string;
}

interface Trade {
  id: number;
  symbol: string;
  longExchange: string;
  shortExchange: string;
  entrySpread: number;
  exitSpread: number;
  pnl: number;
  timestamp: string;
}

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [opportunitiesRes, positionsRes, tradesRes] = await Promise.all([
          fetch('/api/arbitrage'),
          fetch('/api/positions'),
          fetch('/api/trades')
        ]);

        const opportunitiesData = await opportunitiesRes.json();
        const positionsData = await positionsRes.json();
        const tradesData = await tradesRes.json();

        setOpportunities(opportunitiesData.opportunities || []);
        setPositions(positionsData.positions || []);
        setTrades(tradesData.trades || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Refresh data every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-4xl font-bold text-white mb-8">Funding Engine Dashboard</h1>
      
      {/* Arbitrage Opportunities Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Latest Arbitrage Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {opportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 hover:bg-gray-800/70 transition-colors"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {opp.symbol}
                    </h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <span className="flex items-center">
                        <ArrowUpIcon className="mr-1 text-green-500" />
                        {opp.longExchange}
                      </span>
                      <span className="flex items-center">
                        <ArrowDownIcon className="mr-1 text-red-500" />
                        {opp.shortExchange}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-400">
                      {opp.spread.toFixed(2)} bps
                    </p>
                    <p className="text-sm text-gray-400">
                      Est. PnL: ${opp.estimatedPnl.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
              {opportunities.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No arbitrage opportunities available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Active Positions Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Active Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {positions.map((position) => (
                <div
                  key={position.id}
                  className="p-4 rounded-lg bg-gray-800/50"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {position.symbol}
                      </h3>
                      <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">
                        {position.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-400">
                        ${position.currentPnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-gray-900/50">
                      <p className="text-sm text-gray-400">Long Position</p>
                      <p className="text-white">
                        {position.longPosition.exchange} • {position.longPosition.size} BTC
                      </p>
                      <p className="text-sm text-gray-400">
                        @ ${position.longPosition.entryPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-900/50">
                      <p className="text-sm text-gray-400">Short Position</p>
                      <p className="text-white">
                        {position.shortPosition.exchange} • {position.shortPosition.size} BTC
                      </p>
                      <p className="text-sm text-gray-400">
                        @ ${position.shortPosition.entryPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {positions.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No active positions
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Trade History Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Trade History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="p-4">Symbol</th>
                    <th className="p-4">Exchanges</th>
                    <th className="p-4">Entry Spread</th>
                    <th className="p-4">Exit Spread</th>
                    <th className="p-4">PnL</th>
                    <th className="p-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="p-4 text-white">{trade.symbol}</td>
                      <td className="p-4 text-gray-400">
                        {trade.longExchange} / {trade.shortExchange}
                      </td>
                      <td className="p-4 text-white">{trade.entrySpread} bps</td>
                      <td className="p-4 text-white">{trade.exitSpread} bps</td>
                      <td className="p-4 text-green-400">
                        ${trade.pnl.toFixed(2)}
                      </td>
                      <td className="p-4 text-gray-400">
                        {new Date(trade.timestamp).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {trades.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-8">
                        No trade history available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
