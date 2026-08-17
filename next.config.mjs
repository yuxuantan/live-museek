/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingExcludes: {
      '/api/insights': ['./.local/**/*'],
    },
  },
};

export default nextConfig;
