/**
 * Build-time technical configuration. Client-facing settings (names, brand,
 * languages, currency) live in lib/settings and public/config/settings.json.
 * Switch NEXT_PUBLIC_DATA_SOURCE to "api" once the backend is available.
 */
export const appConfig = {
  dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE as 'mock' | 'api') || 'mock',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
  mockLatencyMs: 350,
  /**
   * The ERP is simulated (mock data, or the backend running with X3_MODE=sim):
   * shows the "advance status" button that stands in for the warehouse working in X3.
   */
  simulateErp: (process.env.NEXT_PUBLIC_DATA_SOURCE || 'mock') === 'mock' || process.env.NEXT_PUBLIC_X3_SIM === 'true',
};
