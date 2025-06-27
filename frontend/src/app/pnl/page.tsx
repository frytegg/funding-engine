"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface PnLData {
  totalPnL: number;
  totalFundingEarned: number;
  dailyPnL: {
    date: string;
    pnl: number;
    fundingEarned: number;
  }[];
  exchangePnL: {
    exchange: string;
    pnl: number;
    fundingEarned: number;
  }[];
}

export default function PnLPage() {
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPnL = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/pnl");
        const data = await response.json();
        setData(data);
      } catch (error) {
        console.error("Error fetching PnL data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPnL();
    const interval = setInterval(fetchPnL, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Total PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${data.totalPnL.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Funding Earned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              ${data.totalFundingEarned.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily PnL Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily PnL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyPnL}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="pnl"
                  name="PnL"
                  stroke="#10b981"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="fundingEarned"
                  name="Funding"
                  stroke="#3b82f6"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Exchange Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Exchange Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.exchangePnL}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="exchange" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                <Bar dataKey="pnl" name="PnL" fill="#10b981" />
                <Bar dataKey="fundingEarned" name="Funding" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 