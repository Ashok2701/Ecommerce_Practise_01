import { source, http } from '@/lib/api/httpClient';
import { getDb } from '@/lib/data/mockDb';
import type { Site } from '@/types/domain';

/**
 * Site master from the ERP (warehouses, distribution centres, branches).
 * Backend contract: GET /sites -> Site[]
 */
export const siteService = {
  list: () => source<Site[]>(() => getDb().sites.map(({ priceFactor, ...s }) => s), () => http.get('/sites')),
};
