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

interface PastTrade {
  id: string;
  symbol: string;
  longExchange: string;
  shortExchange: string;
  entryPrice1: number;
  entryPrice2: number;
  exitPrice1: number;
  exitPrice2: number;
  size: number;
  pnl: number;
  fundingEarned: number;
  openTime: string;
  closeTime: string;
}

export default function PastTradesPage() {
  const [trades, setTrades] = useState<PastTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/trades/past");
        const data = await response.json();
        setTrades(data);
      } catch (error) {
        console.error("Error fetching past trades:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Past Trades</CardTitle>
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
                <TableHead>Exit Price (Long)</TableHead>
                <TableHead>Exit Price (Short)</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>Funding Earned</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">
                    No past trades
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
                    <TableCell>${trade.exitPrice1.toFixed(2)}</TableCell>
                    <TableCell>${trade.exitPrice2.toFixed(2)}</TableCell>
                    <TableCell>{trade.size}</TableCell>
                    <TableCell className={trade.pnl >= 0 ? "text-green-500" : "text-red-500"}>
                      ${trade.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell>${trade.fundingEarned.toFixed(2)}</TableCell>
                    <TableCell>
                      {formatDuration(new Date(trade.openTime), new Date(trade.closeTime))}
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

function formatDuration(start: Date, end: Date): string {
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
} 