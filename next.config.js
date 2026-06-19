/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep these server-only packages out of the bundler's tracing.
    serverComponentsExternalPackages: ["mongoose", "@aws-sdk/client-ses", "mongodb-memory-server"],
  },
};

module.exports = nextConfig;
