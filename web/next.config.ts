import type { NextConfig } from 'next';

// The Chrome extension is the only cross-origin caller of /api/*
const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

const nextConfig: NextConfig = {
  async headers() {
    return [
      // ── CORS: /api/* ───────────────────────────────────────────────────────
      // Only the Katana Chrome extension needs cross-origin access to /api/*.
      // Requests from other origins (web UI server components, etc.) are
      // same-origin or server-side and don't require CORS headers.
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: EXTENSION_ID
              ? `chrome-extension://${EXTENSION_ID}`
              : 'null',   // deny all cross-origin if no ID configured
          },
          { key: 'Access-Control-Allow-Methods', value: 'POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },

      // ── Security headers: all routes ───────────────────────────────────────
      {
        source: '/:path*',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Control referrer leakage
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Basic permission policy — deny features this app doesn't need
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
