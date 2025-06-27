"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ActiveTrade {
  id: string;
  symbol: string;
  longExchange: string;
  shortExchange: string;
  entryPrice1: number;
  entryPrice2: number;
  size: number;
  pnl: number;
  fundingEarned: number;
  openTime: string;
}

export default function ActiveTradesPage() {
  const [trades, setTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/trades/active");
        const data = await response.json();
        setTrades(data);
      } catch (error) {
        console.error("Error fetching active trades:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
    const interval = setInterval(fetchTrades, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Active Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Long Exchange</TableHead>
                <TableHead>Short Exchange</TableHead>
                <TableHead>Entry Price (Long)</TableHead>
                <TableHead>Entry Price (Short)</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>Funding Earned</TableHead>
                <TableHead>Open Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    No active trades
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>{trade.symbol}</TableCell>
                    <TableCell>{trade.longExchange}</TableCell>
                    <TableCell>{trade.shortExchange}</TableCell>
                    <TableCell>${trade.entryPrice1.toFixed(2)}</TableCell>
                    <TableCell>${trade.entryPrice2.toFixed(2)}</TableCell>
                    <TableCell>{trade.size}</TableCell>
                    <TableCell className={trade.pnl >= 0 ? "text-green-500" : "text-red-500"}>
                      ${trade.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell>${trade.fundingEarned.toFixed(2)}</TableCell>
                    <TableCell>
                      {new Date(trade.openTime).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
} 