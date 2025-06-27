"use client";

import { useEffect, useState } from "react";
import { fetchOpportunities } from "@/lib/api";
import { FundingOpportunity } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercent, formatDateTime } from "@/lib/utils";

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await fetchOpportunities();
      setOpportunities(data.opportunities);
      setLastUpdated(data.lastUpdated);
      setError(null);
    } catch (err) {
      setError("Failed to fetch opportunities");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Funding Opportunities</h1>
        {lastUpdated && (
          <p className="text-sm text-muted-foreground">
            Last updated: {formatDateTime(lastUpdated)}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-red-500">{error}</div>
          ) : loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Exchanges</TableHead>
                  <TableHead className="text-right">Net Rate</TableHead>
                  <TableHead className="text-right">Est. Profit</TableHead>
                  <TableHead className="text-right">24h Volume</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.id}>
                    <TableCell className="font-medium">{opp.symbol}</TableCell>
                    <TableCell>
                      {opp.longExchange} → {opp.shortExchange}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(opp.netFundingRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(opp.estimatedProfitPct)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${formatNumber(opp.volume24h)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={opp.status === "active" ? "success" : "secondary"}
                      >
                        {opp.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 