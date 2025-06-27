"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface SystemStatus {
  status: 'operational' | 'degraded' | 'down';
  lastUpdate: string;
  activeOpportunities: number;
  activeTrades: number;
  dailyPnL: number;
}

export default function HomePage() {
  const [status, setStatus] = useState<SystemStatus>({
    status: 'operational',
    lastUpdate: '',
    activeOpportunities: 0,
    activeTrades: 0,
    dailyPnL: 0,
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        console.log('Fetching status from backend...');
        const response = await fetch("http://localhost:3001/api/status");
        const result = await response.json();
        console.log('Received response:', result);
        if (result.success && result.data) {
          setStatus({
            status: result.data.status,
            lastUpdate: result.data.lastUpdate,
            activeOpportunities: result.data.activeOpportunities,
            activeTrades: result.data.activeTrades,
            dailyPnL: result.data.dailyPnL
          });
        } else {
          console.error("Invalid response format:", result);
          setStatus({
            status: 'degraded',
            lastUpdate: new Date().toISOString(),
            activeOpportunities: 0,
            activeTrades: 0,
            dailyPnL: 0
          });
        }
      } catch (error) {
        console.error("Error fetching system status:", error);
        setStatus({
          status: 'degraded',
          lastUpdate: new Date().toISOString(),
          activeOpportunities: 0,
          activeTrades: 0,
          dailyPnL: 0
        });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Badge
          variant={
            status?.status === 'operational'
              ? 'success'
              : status?.status === 'degraded'
              ? 'secondary'
              : 'destructive'
          }
        >
          {status?.status ? status.status.charAt(0).toUpperCase() + status.status.slice(1) : 'Unknown'}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.activeOpportunities}</div>
            <Link
              href="/opportunities"
              className="text-sm text-muted-foreground hover:underline"
            >
              View all opportunities
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.activeTrades}</div>
            <Link
              href="/active-trades"
              className="text-sm text-muted-foreground hover:underline"
            >
              View active trades
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${status?.dailyPnL?.toFixed(2) ?? '0.00'}
            </div>
            <Link
              href="/pnl"
              className="text-sm text-muted-foreground hover:underline"
            >
              View PnL details
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Update</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.lastUpdate ? new Date(status.lastUpdate).toLocaleTimeString() : '--:--:--'}
            </div>
            <p className="text-sm text-muted-foreground">
              {status?.lastUpdate ? new Date(status.lastUpdate).toLocaleDateString() : '--/--/--'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
