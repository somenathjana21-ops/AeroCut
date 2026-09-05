/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    '@remotion/renderer',
    '@remotion/bundler',
    'esbuild',
  ],
};

export default nextConfig;

