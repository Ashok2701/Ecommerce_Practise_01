/**
 * Runtime configuration. Switch NEXT_PUBLIC_DATA_SOURCE to "api" once the
 * Node.js backend (→ ERP integration layer → Sage X3) is available.
 */
export const appConfig = {
  appName: 'Nexus B2B',
  dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE as 'mock' | 'api') || 'mock',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
  erp: { name: 'Sage X3', mode: 'Mock' },
  currency: 'INR',
  locale: 'en-IN',
  mockLatencyMs: 350,
};
