export interface FundingOpportunity {
  id: string;
  symbol: string;
  longExchange: string;
  shortExchange: string;
  fundingRateLong: number;
  fundingRateShort: number;
  netFundingRate: number;
  timestamp: string;
  status: 'active' | 'inactive';
  minimumSpread: number;
  volume24h: number;
  estimatedProfitPct: number;
}

export interface OpportunitiesResponse {
  opportunities: FundingOpportunity[];
  lastUpdated: string;
}

export interface ApiError {
  message: string;
  code?: string;
} 