import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            // Baseline CSP compatible with Next.js
            // - 'self' for same-origin resources
            // - 'unsafe-inline' and 'unsafe-eval' required for Next.js runtime (can be removed with nonces)
            // - blob: and data: for image previews
            // 
            // To tighten further:
            // 1. Use Next.js nonce support for inline scripts/styles:
            //    Add nonce to script-src and style-src, remove 'unsafe-inline'
            // 2. Replace 'unsafe-eval' with 'wasm-unsafe-eval' if possible
            // 3. Add specific domains for fonts, APIs etc.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
