import { apiRequest } from '@/lib/apiClient';
import type { AffiliateOperationsProjection } from '@/types/affiliateOperations';

export const getAffiliateOperationsProjection = async (
  query: string,
  signal?: AbortSignal,
): Promise<AffiliateOperationsProjection> => apiRequest<AffiliateOperationsProjection>(
  `/api/admin/affiliate-operations?${query}`,
  { signal },
);
