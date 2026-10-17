/**
 * Build-time technical configuration. Client-facing settings (names, brand,
 * languages, currency) live in lib/settings and public/config/settings.json.
 * Switch NEXT_PUBLIC_DATA_SOURCE to "api" once the backend is available.
 */
export const appConfig = {
  dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE as 'mock' | 'api') || 'mock',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
  mockLatencyMs: 350,
};
