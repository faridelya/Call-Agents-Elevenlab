import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Disable build-time Google Fonts download — Docker build containers have no
  // outbound access to fonts.googleapis.com. Fonts load at runtime instead.
  optimizeFonts: false,
};

export default config;
