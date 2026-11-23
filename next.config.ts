import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  // Keep production QA separate from the live extension-driven dev experiment.
  distDir: process.env.PROOFQUEST_DIST_DIR || '.next',
  transpilePackages: ['@primuslabs/zktls-js-sdk'],
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.DefinePlugin({ global: 'globalThis' }));
    config.module.rules.push({ test: /\.js$/, include: /[\\/]@primuslabs[\\/]zktls-js-sdk[\\/]dist[\\/]/, enforce: 'pre', use: [path.resolve('scripts/primus-privacy-loader.cjs')] });
    return config;
  },
};
export default config;
