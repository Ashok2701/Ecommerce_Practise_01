/** @type {import('next').NextConfig} */

// Security headers for every response. The portal is never meant to be shown
// inside another site's frame, so framing is limited to our own origin.
// Camera and location are allowed for barcode scanning and visit check-ins.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=()' },
];

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Type errors must fail the build.
  typescript: { ignoreBuildErrors: false },
  // No ESLint config in the project yet; type checking is the build gate for now.
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
  images: { unoptimized: true },
  webpack(config, { dev }) {
    if (dev) {
      // Polling keeps file watching reliable on network drives and VMs.
      config.watchOptions = { poll: 2000, aggregateTimeout: 300, ignored: ['**/node_modules'] };
    }
    return config;
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
