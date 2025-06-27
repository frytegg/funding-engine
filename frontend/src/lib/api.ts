import { OpportunitiesResponse, ApiError, FundingOpportunity } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchOpportunities(): Promise<OpportunitiesResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/opportunities`);
    
    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || 'Failed to fetch opportunities');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    throw error;
  }
}

export async function fetchOpportunityById(id: string): Promise<FundingOpportunity> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/opportunities/${id}`);
    
    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || 'Failed to fetch opportunity');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    throw error;
  }
} 